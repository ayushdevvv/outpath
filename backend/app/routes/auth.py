import uuid
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.models import OAuthAccount, User
from app.middleware.rate_limit import limiter
from app.schemas import AuthSessionOut, GoogleCredentialIn, LoginIn, RegisterIn, UserOut
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


def _create_session(response: Response, user_id: uuid.UUID) -> str:
    token = issue_session_token(user_id)
    response.set_cookie(
        settings.session_cookie_name,
        token,
        max_age=settings.session_max_age_seconds,
        **_session_cookie_options(),
    )
    return token


@router.post("/register", response_model=AuthSessionOut)
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

    token = _create_session(response, user.id)
    return {"user": user, "session_token": token}


@router.post("/login", response_model=AuthSessionOut)
@limiter.limit("10/minute")
async def login(request: Request, payload: LoginIn, response: Response, db: AsyncSession = Depends(get_db)):
    email = str(payload.email).strip().lower()
    user = await db.scalar(select(User).where(User.email == email))
    if not user or not user.password_hash or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "That email and password don't match.")

    token = _create_session(response, user.id)
    return {"user": user, "session_token": token}


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

@router.post("/google/verify", response_model=AuthSessionOut)
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

    # --------------------------------------------------------------------
    # Find-or-create the user, then link this Google identity to them.
    #
    # The previous version of this handler did a manual SELECT, then an
    # INSERT, and caught IntegrityError by hand if two requests landed at
    # the same time (the Google Identity Services popup can genuinely fire
    # its callback more than once, and a slow first request plus an
    # impatient retry from the client both hit this endpoint concurrently).
    # That hand-rolled recovery path had a gap: if the rollback and re-query
    # didn't line up perfectly, both requests could come away empty-handed
    # and the user got a 409 "could not be linked" even though their account
    # was actually fine. Postgres's own `INSERT ... ON CONFLICT DO NOTHING`
    # makes the insert itself race-proof — at most one of two concurrent
    # requests actually inserts a row, the other silently no-ops, and both
    # then read back the same, single, canonical row. No exceptions, no
    # rollback bookkeeping, no possibility of a false 409.

    # 1) Fast path: this Google identity is already linked to someone.
    account = await db.scalar(
        select(OAuthAccount).where(
            OAuthAccount.provider == "google", OAuthAccount.provider_account_id == google_id
        )
    )
    user = await db.get(User, account.user_id) if account else None

    if user is None:
        # 2) Find-or-create the user by email. ON CONFLICT DO NOTHING means
        # a concurrent sign-up with the same email can never raise here —
        # it just means our insert is the no-op and we read back theirs.
        user = await db.scalar(select(User).where(User.email == email))

    if user is None:
        insert_user = (
            pg_insert(User)
            .values(id=uuid.uuid4(), name=name, email=email, password_hash=None)
            .on_conflict_do_nothing(index_elements=["email"])
        )
        await db.execute(insert_user)
        user = await db.scalar(select(User).where(User.email == email))

    if user is None:
        # Unreachable in practice: the row we (or a concurrent request) just
        # inserted always satisfies this immediate re-read.
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Could not create your account. Please try again.")

    # 3) Link this Google identity to that user, same no-conflict-possible
    # pattern. If another request already linked it (to this same user, or
    # even raced us here), we simply don't insert a duplicate row.
    if account is None:
        insert_account = (
            pg_insert(OAuthAccount)
            .values(id=uuid.uuid4(), user_id=user.id, provider="google", provider_account_id=google_id)
            .on_conflict_do_nothing(constraint="uq_oauth_identity")
        )
        await db.execute(insert_account)

    await db.commit()
    await db.refresh(user)
    token = _create_session(response, user.id)
    return {"user": user, "session_token": token}
