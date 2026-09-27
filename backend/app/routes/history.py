import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import ApiRequest, Environment, RequestHistory, User
from app.schemas import HistoryOut, HistoryPageOut, OverviewOut
from app.security import get_current_user
from pydantic import BaseModel, Field

router = APIRouter(tags=["history"])


class LocalHistoryIn(BaseModel):
    request_id: uuid.UUID | None = None
    method: str = Field(min_length=3, max_length=10)
    url: str = Field(min_length=1, max_length=8192)
    status: int | None = None
    duration_ms: int | None = None
    size_bytes: int | None = None
    error: str | None = None


@router.get("/api/history", response_model=HistoryPageOut)
async def list_history(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=10, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    base = select(RequestHistory).where(RequestHistory.user_id == user.id)
    total = await db.scalar(select(func.count(RequestHistory.id)).where(RequestHistory.user_id == user.id)) or 0
    rows = await db.scalars(
        base.options(selectinload(RequestHistory.request).selectinload(ApiRequest.assertions))
        .order_by(RequestHistory.created_at.desc(), RequestHistory.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    items = rows.unique().all()
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "has_more": page * page_size < total,
    }


@router.post("/api/history", response_model=HistoryOut, status_code=201)
async def log_history(
    payload: LocalHistoryIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    """Records a request executed directly by the browser against a local/private target.

    The local target is never proxied through Outpath's server; only timing/result
    metadata is persisted here after the browser receives the response."""
    if payload.request_id:
        owned_request = await db.scalar(
            select(ApiRequest.id).where(ApiRequest.id == payload.request_id, ApiRequest.user_id == user.id)
        )
        if not owned_request:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Request not found.")

    entry = RequestHistory(
        user_id=user.id,
        request_id=payload.request_id,
        method=payload.method,
        url=payload.url,
        status=payload.status,
        duration_ms=payload.duration_ms,
        size_bytes=payload.size_bytes,
        error=payload.error,
        used_local_request=True,
    )
    db.add(entry)
    await db.commit()
    entry = await db.scalar(
        select(RequestHistory)
        .options(selectinload(RequestHistory.request).selectinload(ApiRequest.assertions))
        .where(RequestHistory.id == entry.id)
    )
    return entry


@router.get("/api/overview", response_model=OverviewOut)
async def overview(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    request_count = await db.scalar(
        select(func.count()).select_from(ApiRequest).where(ApiRequest.user_id == user.id)
    )
    history_count = await db.scalar(
        select(func.count()).select_from(RequestHistory).where(RequestHistory.user_id == user.id)
    )
    environment_count = await db.scalar(
        select(func.count()).select_from(Environment).where(Environment.user_id == user.id)
    )
    recent = await db.scalars(
        select(RequestHistory)
        .options(selectinload(RequestHistory.request).selectinload(ApiRequest.assertions))
        .where(RequestHistory.user_id == user.id)
        .order_by(RequestHistory.created_at.desc())
        .limit(8)
    )
    answered, ok, avg_ms = (
        await db.execute(
            select(
                func.count(RequestHistory.status),
                func.count(case((RequestHistory.status.between(200, 399), 1))),
                func.avg(RequestHistory.duration_ms),
            ).where(RequestHistory.user_id == user.id)
        )
    ).one()

                                                                                 
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    since = today - timedelta(days=6)
    stamps = await db.scalars(
        select(RequestHistory.created_at).where(
            RequestHistory.user_id == user.id, RequestHistory.created_at >= since
        )
    )
    daily = [0] * 7
    for ts in stamps:
        idx = (ts.astimezone(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0) - since).days
        if 0 <= idx < 7:
            daily[idx] += 1

    return OverviewOut(
        success_rate=round(ok * 100 / answered, 1) if answered else None,
        avg_duration_ms=round(avg_ms) if avg_ms is not None else None,
        sends_last_7d=sum(daily),
        daily_sends=daily,
        request_count=request_count or 0,
        history_count=history_count or 0,
        environment_count=environment_count or 0,
        recent=recent.unique().all(),
    )
