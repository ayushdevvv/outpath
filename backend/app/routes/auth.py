import uuid
import httpx
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


@limiter.limit("5/hour")
@router.post("/register", response_model=UserOut)
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


@limiter.limit("10/minute")
@router.post("/login", response_model=UserOut)
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

@limiter.limit("10/minute")
@router.post("/google/verify", response_model=UserOut)
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
    """
    if not settings.google_client_id:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Google sign-in is not configured.")

    async with httpx.AsyncClient(timeout=10) as client:
        try:
            token_resp = await client.get(
                "https://oauth2.googleapis.com/tokeninfo",
                params={"id_token": payload.credential},
            )
        except httpx.HTTPError as exc:
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Google sign-in could not be verified.") from exc

    if token_resp.status_code != 200:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Google sign-in could not be verified.")

    try:
        info = token_resp.json()
    except ValueError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Google returned an invalid identity response.") from exc

    issuer = info.get("iss")
    audience = info.get("aud")
    if issuer not in {"https://accounts.google.com", "accounts.google.com"} or audience != settings.google_client_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Google sign-in could not be verified.")

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
