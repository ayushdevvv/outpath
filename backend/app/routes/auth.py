import secrets
import uuid
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.models import OAuthAccount, User
from app.middleware.rate_limit import limiter
from app.schemas import LoginIn, RegisterIn, UserOut
from app.security import get_current_user, hash_password, issue_session_token, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])
settings = get_settings()

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"


def _set_session_cookie(response: Response, user_id: uuid.UUID) -> None:
    response.set_cookie(
        settings.session_cookie_name,
        issue_session_token(user_id),
        max_age=settings.session_max_age_seconds,
        httponly=True,
        secure=settings.environment != "development",
        samesite="lax",
        path="/",
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
    response.delete_cookie(settings.session_cookie_name, path="/")
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)):
    return user


# ------------------------------------------------------------- Google OAuth

@limiter.limit("10/minute")
@router.get("/google/start")
async def google_start(request: Request):
    if not settings.google_client_id:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Google sign-in is not configured.")

    state = secrets.token_urlsafe(24)
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "access_type": "online",
        "prompt": "select_account",
    }
    query = urlencode(params)
    resp = RedirectResponse(f"{GOOGLE_AUTH_URL}?{query}")
    resp.set_cookie(
        "outbox_oauth_state",
        state,
        max_age=600,
        httponly=True,
        secure=settings.environment != "development",
        samesite="lax",
        path="/",
    )
    return resp


@router.get("/google/callback")
async def google_callback(request: Request, code: str = "", state: str = "", db: AsyncSession = Depends(get_db)):
    expected_state = request.cookies.get("outbox_oauth_state")
    if not code or not state or state != expected_state:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid OAuth state.")

    async with httpx.AsyncClient(timeout=10) as client:
        token_resp = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": settings.google_redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        if token_resp.status_code != 200:
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Google sign-in failed.")
        access_token = token_resp.json().get("access_token")
        if not access_token:
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Google sign-in failed.")

        info_resp = await client.get(
            GOOGLE_USERINFO_URL, headers={"Authorization": f"Bearer {access_token}"}
        )
        if info_resp.status_code != 200:
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Google sign-in failed.")
        info = info_resp.json()

    google_id = info.get("sub")
    if not google_id:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Google account information is incomplete.")
    email = (info.get("email") or "").strip().lower() or None
    name = info.get("name") or (email.split("@")[0] if email else "Outbox user")

    account = await db.scalar(
        select(OAuthAccount).where(
            OAuthAccount.provider == "google", OAuthAccount.provider_account_id == google_id
        )
    )
    if account:
        user = await db.get(User, account.user_id)
    else:
        user = await db.scalar(select(User).where(User.email == email)) if email else None
        if not user:
            user = User(name=name, email=email or f"{google_id}@google.outbox", password_hash=None)
            db.add(user)
            await db.flush()
        db.add(OAuthAccount(user_id=user.id, provider="google", provider_account_id=google_id))
        await db.commit()
        await db.refresh(user)

    resp = RedirectResponse(f"{settings.frontend_url}/app")
    resp.delete_cookie("outbox_oauth_state")
    _set_session_cookie(resp, user.id)
    return resp
