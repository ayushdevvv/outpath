import uuid
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.models import OAuthAccount, User
from app.middleware.rate_limit import limiter
from app.schemas import GoogleCredentialIn, LoginIn, RegisterIn, UserOut
from app.security import get_current_user, hash_password, issue_session_token, verify_password

# A single shared Request object lets google-auth reuse one HTTP connection
# pool across verifications instead of opening a new one every call.
_google_auth_request = google_requests.Request()

router = APIRouter(prefix="/api/auth", tags=["auth"])
settings = get_settings()


def _session_cookie_options() -> dict:
    # Vercel frontend + Render API are cross-site in production. The session
    # cookie therefore needs SameSite=None + Secure so credentialed fetches
    # can carry the Outpath session. Local localhost development can safely
    # stay on Lax.
    production = settings.environment != "development"
    return {
        "secure": production,
        "samesite": "none" if production else "lax",
        "httponly": True,
        "path": "/",
    }


def _set_session_cookie(response: Response, user_id: uuid.UUID) -> None:
    response.set_cookie(
        settings.session_cookie_name,
        issue_session_token(user_id),
        max_age=settings.session_max_age_seconds,
        **_session_cookie_options(),
    )


@router.post("/register", response_model=UserOut)
@limiter.limit("5/hour")
async def register(request: Request, payload: RegisterIn, response: Response, db: AsyncSession = Depends(get_db)):
    email = str(payload.email).strip().lower()
    existing = await db.scalar(select(User).where(User.email == email))
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists.")

    user = User(name=payload.name.strip(), email=email, password_hash=hash_password(payload.password))
    db.add(user)
    await db.commit()
    await db.refresh(user)

    _set_session_cookie(response, user.id)
    return user


@router.post("/login", response_model=UserOut)
@limiter.limit("10/minute")
async def login(request: Request, payload: LoginIn, response: Response, db: AsyncSession = Depends(get_db)):
    email = str(payload.email).strip().lower()
    user = await db.scalar(select(User).where(User.email == email))
    if not user or not user.password_hash or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "That email and password don't match.")

    _set_session_cookie(response, user.id)
    return user


@router.post("/logout")
async def logout(response: Response):
    options = _session_cookie_options()
    response.delete_cookie(
        settings.session_cookie_name,
        path=options["path"],
        secure=options["secure"],
        httponly=options["httponly"],
        samesite=options["samesite"],
    )
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)):
    return user


# --------------------------------------------------------- Google Identity Services

@router.post("/google/verify", response_model=UserOut)
@limiter.limit("10/minute")
async def google_verify(
    request: Request,
    payload: GoogleCredentialIn,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    """
    React uses Google Identity Services with only the browser client ID.
    The backend does not run an OAuth redirect/client-secret flow; it only
    verifies the signed Google ID token and turns it into the existing Outpath
    session cookie so protected application APIs remain user-scoped.

    The token is verified locally (its signature is checked against Google's
    published public keys, which google-auth fetches and caches) instead of
    calling Google's /tokeninfo endpoint. /tokeninfo is explicitly documented
    by Google as being for debugging only and is aggressively rate-limited —
    under any real traffic it starts failing intermittently with unrelated
    502/429s, which is the "different types of errors" this replaces.
    """
    if not settings.google_client_id:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Google sign-in is not configured.")

    try:
        info = google_id_token.verify_oauth2_token(
            payload.credential, _google_auth_request, settings.google_client_id
        )
    except ValueError:
        # Covers every local-verification failure google-auth can raise:
        # bad signature, expired token, wrong audience/issuer, malformed JWT.
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Google sign-in could not be verified.")
    except Exception as exc:  # network error fetching Google's public keys, etc.
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Google sign-in could not be verified.") from exc

    if str(info.get("email_verified", "")).lower() not in {"true", "1"}:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Your Google email is not verified.")

    google_id = str(info.get("sub") or "").strip()
    email = str(info.get("email") or "").strip().lower()
    if not google_id or not email:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Google account information is incomplete.")

    name = str(info.get("name") or email.split("@")[0] or "Outpath user").strip()[:120]

    account = await db.scalar(
        select(OAuthAccount).where(
            OAuthAccount.provider == "google", OAuthAccount.provider_account_id == google_id
        )
    )
    user = await db.get(User, account.user_id) if account else None

    if user is None:
        user = await db.scalar(select(User).where(User.email == email))

    if user is None:
        # New Google-first account. The unique email constraint protects the
        # identity boundary; the small retry below handles concurrent sign-in.
        user = User(name=name, email=email, password_hash=None)
        db.add(user)
        try:
            await db.flush()
        except IntegrityError:
            await db.rollback()
            user = await db.scalar(select(User).where(User.email == email))
            if user is None:
                raise HTTPException(status.HTTP_409_CONFLICT, "That Google account is already being created. Please try again.")

    if not account:
        account = await db.scalar(
            select(OAuthAccount).where(
                OAuthAccount.provider == "google", OAuthAccount.provider_account_id == google_id
            )
        )
        if account is None:
            db.add(OAuthAccount(user_id=user.id, provider="google", provider_account_id=google_id))

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        account = await db.scalar(
            select(OAuthAccount).where(
                OAuthAccount.provider == "google", OAuthAccount.provider_account_id == google_id
            )
        )
        user = await db.scalar(select(User).where(User.email == email))
        if account is None or user is None:
            raise HTTPException(status.HTTP_409_CONFLICT, "This Google account could not be linked. Please try again.")

    await db.refresh(user)
    _set_session_cookie(response, user.id)
    return user
