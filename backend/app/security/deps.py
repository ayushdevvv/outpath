import uuid

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.models import User
from app.security import read_session_token

settings = get_settings()


async def get_current_user(
    request: Request, db: AsyncSession = Depends(get_db)
) -> User:
    token = request.cookies.get(settings.session_cookie_name)
    user_id: uuid.UUID | None = read_session_token(token) if token else None
    if not user_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not signed in.")

    user = await db.scalar(select(User).where(User.id == user_id))
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not signed in.")
    return user


async def get_current_user_optional(
    request: Request, db: AsyncSession = Depends(get_db)
) -> User | None:
    token = request.cookies.get(settings.session_cookie_name)
    if not token:
        return None
    user_id = read_session_token(token)
    if not user_id:
        return None
    return await db.scalar(select(User).where(User.id == user_id))
