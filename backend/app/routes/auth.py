import uuid
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.models import OAuthAccount, User
from app.middleware.rate_limit import limiter
from app.schemas import GoogleCredentialIn, LoginIn, RegisterIn, UserOut
from app.security import get_current_user, hash_password, issue_session_token, verify_password

_google_auth_request = google_requests.Request()
router = APIRouter(prefix="/api/auth", tags=["auth"])
settings = get_settings()


def _session_cookie_options() -> dict:
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
        if existing.password_hash:
            raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists.")
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "This email already belongs to a Google account. Continue with Google, then set a password from your account settings.",
        )

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
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "No Outpath account was found for that email.")
    if not user.password_hash:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "This account uses Google sign-in. Continue with Google for this email.",
        )
    if not verify_password(payload.password, user.password_hash):
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

async def _resolve_google_user(db: AsyncSession, google_id: str, email: str, name: str) -> User:
    """Return the one canonical Outpath user for a verified Google identity.

    The Google `sub` is the stable identity key. Email is only used to connect
    a first-time Google login to an existing Outpath account. All writes use
    PostgreSQL upserts so repeated GSI callbacks and concurrent requests are
    safe and do not turn a successful login into a false 409.
    """
    # A previously-linked Google identity always wins. This also repairs the
    # situation where an old deployment left the identity linked in the DB.
    account = await db.scalar(
        select(OAuthAccount).where(
            OAuthAccount.provider == "google",
            OAuthAccount.provider_account_id == google_id,
        )
    )
    if account:
        user = await db.get(User, account.user_id)
        if user:
            return user

    # Existing email accounts are linked to the verified Google identity.
    user = await db.scalar(select(User).where(User.email == email))

    # First-time Google user: create the user. If another callback or a normal
    # signup creates the same email at the same time, ON CONFLICT simply loses
    # the race and the canonical row is read back immediately.
    if user is None:
        await db.execute(
            pg_insert(User)
            .values(id=uuid.uuid4(), name=name, email=email, password_hash=None)
            .on_conflict_do_nothing(index_elements=["email"])
        )
        user = await db.scalar(select(User).where(User.email == email))
        if user is None:
            raise HTTPException(
                status.HTTP_500_INTERNAL_SERVER_ERROR,
                "Could not create your Outpath account. Please try Google sign-in again.",
            )

    # Link the Google subject. Use column inference rather than the constraint
    # name so older production schemas with a different generated constraint
    # name still work.
    await db.execute(
        pg_insert(OAuthAccount)
        .values(
            id=uuid.uuid4(),
            user_id=user.id,
            provider="google",
            provider_account_id=google_id,
        )
        .on_conflict_do_nothing(index_elements=["provider", "provider_account_id"])
    )

    # IMPORTANT: another callback may have won the insert race. Always read
    # the row back and use the user it actually points at.
    account = await db.scalar(
        select(OAuthAccount).where(
            OAuthAccount.provider == "google",
            OAuthAccount.provider_account_id == google_id,
        )
    )
    if account:
        linked_user = await db.get(User, account.user_id)
        if linked_user:
            return linked_user

    raise HTTPException(
        status.HTTP_500_INTERNAL_SERVER_ERROR,
        "Google account linking did not complete. Please try again.",
    )


@router.post("/google/verify", response_model=UserOut)
@limiter.limit("10/minute")
async def google_verify(
    request: Request,
    payload: GoogleCredentialIn,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    """Verify a Google ID token and establish the normal Outpath session."""
    if not settings.google_client_id:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Google sign-in is not configured.")

    try:
        info = google_id_token.verify_oauth2_token(
            payload.credential,
            _google_auth_request,
            settings.google_client_id,
        )
    except ValueError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Google sign-in could not be verified.") from exc
    except Exception as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Google sign-in could not be verified.") from exc

    if str(info.get("email_verified", "")).lower() not in {"true", "1"}:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Your Google email is not verified.")

    google_id = str(info.get("sub") or "").strip()
    email = str(info.get("email") or "").strip().lower()
    if not google_id or not email:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Google account information is incomplete.")

    name = str(info.get("name") or email.split("@")[0] or "Outpath user").strip()[:120]

    try:
        user = await _resolve_google_user(db, google_id, email, name)
        await db.commit()
    except IntegrityError:
        # Be defensive against legacy schemas / old duplicate data. Never turn
        # a recoverable identity race into a misleading 409. Roll back and
        # resolve the already-existing canonical Google row instead.
        await db.rollback()
        account = await db.scalar(
            select(OAuthAccount).where(
                OAuthAccount.provider == "google",
                OAuthAccount.provider_account_id == google_id,
            )
        )
        if not account:
            raise HTTPException(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                "Google sign-in is temporarily unavailable. Please try again.",
            )
        user = await db.get(User, account.user_id)
        if not user:
            raise HTTPException(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                "Google account data is incomplete. Please try again.",
            )

    _set_session_cookie(response, user.id)
    return user
