import uuid

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.models import User
from app.security import read_session_token

settings = get_settings()


def _request_token(request: Request) -> str | None:
    authorization = request.headers.get("authorization", "")
    if authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()
        if token:
            return token
    return request.cookies.get(settings.session_cookie_name)


def _request_user_id(request: Request) -> uuid.UUID | None:
    # Prefer the explicit bearer session issued by Outpath, then fall back to
    # the HttpOnly cookie. The fallback is important for Vercel -> Render
    # deployments where browser third-party-cookie policy can block the cookie.
    authorization = request.headers.get("authorization", "")
    if authorization.lower().startswith("bearer "):
        bearer = authorization[7:].strip()
        if bearer:
            user_id = read_session_token(bearer)
            if user_id:
                return user_id

    cookie = request.cookies.get(settings.session_cookie_name)
    return read_session_token(cookie) if cookie else None


async def get_current_user(
    request: Request, db: AsyncSession = Depends(get_db)
) -> User:
    user_id = _request_user_id(request)
    if not user_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not signed in.")

    user = await db.scalar(select(User).where(User.id == user_id))
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not signed in.")
    return user


async def get_current_user_optional(
    request: Request, db: AsyncSession = Depends(get_db)
) -> User | None:
    user_id = _request_user_id(request)
    if not user_id:
        return None
    return await db.scalar(select(User).where(User.id == user_id))
