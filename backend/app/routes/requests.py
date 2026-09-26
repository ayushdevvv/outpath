import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import ApiRequest, Assertion, Collection, Environment, RequestHistory, User
from app.middleware.rate_limit import limiter
from app.schemas import ExecuteIn, ExecuteOut, RequestIn, RequestOut
from app.security import get_current_user
from app.services.execution import ExecutionError, execute_request
from app.services.variables import resolve_all
from app.utils.redact import redact_url_secrets

router = APIRouter(prefix="/api/requests", tags=["requests"])


async def _owned_request(request_id: uuid.UUID, user: User, db: AsyncSession) -> ApiRequest:
    req = await db.scalar(
        select(ApiRequest)
        .options(selectinload(ApiRequest.assertions))
        .where(ApiRequest.id == request_id, ApiRequest.user_id == user.id)
    )
    if not req:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Request not found.")
    return req




async def _validate_collection_owner(
    collection_id: uuid.UUID | None, user: User, db: AsyncSession
) -> None:
    if collection_id is None:
        return
    exists = await db.scalar(
        select(Collection.id).where(Collection.id == collection_id, Collection.user_id == user.id)
    )
    if not exists:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Collection not found.")

def _apply_assertions(req: ApiRequest, assertions_in) -> None:
    req.assertions.clear()
    for i, a in enumerate(assertions_in):
        req.assertions.append(
            Assertion(kind=a.kind, path=a.path, expected=a.expected, enabled=a.enabled, position=i)
        )


@router.post("", response_model=RequestOut, status_code=status.HTTP_201_CREATED)
async def create_request(
    payload: RequestIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    await _validate_collection_owner(payload.collection_id, user, db)
    req = ApiRequest(
        user_id=user.id,
        collection_id=payload.collection_id,
        name=payload.name,
        method=payload.method,
        url=payload.url,
        params=[p.model_dump() for p in payload.params],
        headers=[h.model_dump() for h in payload.headers],
        auth=payload.auth.model_dump(by_alias=True),
        body=payload.body,
    )
    _apply_assertions(req, payload.assertions)
    db.add(req)
    await db.commit()
    await db.refresh(req, attribute_names=["assertions"])
    return req


@router.put("/{request_id}", response_model=RequestOut)
async def update_request(
    request_id: uuid.UUID,
    payload: RequestIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    req = await _owned_request(request_id, user, db)
    await _validate_collection_owner(payload.collection_id, user, db)
    req.name = payload.name
    req.method = payload.method
    req.url = payload.url
    req.params = [p.model_dump() for p in payload.params]
    req.headers = [h.model_dump() for h in payload.headers]
    req.auth = payload.auth.model_dump(by_alias=True)
    req.body = payload.body
    req.collection_id = payload.collection_id
    _apply_assertions(req, payload.assertions)
    await db.commit()
    await db.refresh(req, attribute_names=["assertions"])
    return req


@router.delete("/{request_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_request(
    request_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    req = await _owned_request(request_id, user, db)
    await db.delete(req)
    await db.commit()


@router.post("/{request_id}/duplicate", response_model=RequestOut, status_code=status.HTTP_201_CREATED)
async def duplicate_request(
    request_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    original = await _owned_request(request_id, user, db)
    copy = ApiRequest(
        user_id=user.id,
        collection_id=original.collection_id,
        name=f"{original.name} copy",
        method=original.method,
        url=original.url,
        params=original.params,
        headers=original.headers,
        auth=original.auth,
        body=original.body,
    )
    copy.assertions = [
        Assertion(kind=a.kind, path=a.path, expected=a.expected, enabled=a.enabled, position=a.position)
        for a in original.assertions
    ]
    db.add(copy)
    await db.commit()
    await db.refresh(copy, attribute_names=["assertions"])
    return copy


@limiter.limit("30/minute")
@router.post("/execute", response_model=ExecuteOut)
async def execute(request: Request, payload: ExecuteIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):

    """
    Executes a request the browser could not send directly (cross-origin,
    or the user wants Outpath's measured timing/history). Local and private
    targets are rejected here by design — see services/execution.py — and
    must go through the browser extension's local bridge instead.
    """
    variables: dict[str, str] = {}
    secret_values: set[str] = set()
    if payload.environment_id:
        env = await db.scalar(
            select(Environment)
            .options(selectinload(Environment.variables))
            .where(Environment.id == payload.environment_id, Environment.user_id == user.id)
        )
        if not env:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Environment not found.")
        for v in env.variables:
            variables[v.name] = v.value
            if v.secret:
                secret_values.add(v.value)

    if payload.request_id:
        owned_request_id = await db.scalar(
            select(ApiRequest.id).where(ApiRequest.id == payload.request_id, ApiRequest.user_id == user.id)
        )
        if not owned_request_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Request not found.")

    raw = {
        "url": payload.url,
        "params": [p.model_dump() for p in payload.params],
        "headers": [h.model_dump() for h in payload.headers],
        "auth": payload.auth.model_dump(by_alias=True),
        "body": payload.body,
    }
    resolved, missing = resolve_all(raw, variables)
    if missing:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Unresolved variable(s): {', '.join(missing)}.",
        )

    logged_url = redact_url_secrets(resolved["url"], secret_values)

    try:
        result = await execute_request(
            method=payload.method,
            url=resolved["url"],
            params=resolved["params"],
            headers=resolved["headers"],
            auth=resolved["auth"],
            body=resolved["body"],
        )
    except ExecutionError as exc:
        db.add(
            RequestHistory(
                user_id=user.id,
                request_id=payload.request_id,
                method=payload.method,
                url=logged_url,
                status=None,
                duration_ms=None,
                size_bytes=None,
                error=exc.message,
                used_bridge=False,
            )
        )
        await db.commit()
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST if exc.blocked else status.HTTP_502_BAD_GATEWAY,
            {
                "message": exc.message,
                "code": "ssrf_blocked" if exc.blocked else "upstream_request_failed",
            },
        ) from exc

    db.add(
        RequestHistory(
            user_id=user.id,
            request_id=payload.request_id,
            method=payload.method,
            url=logged_url,
            status=result["status"],
            duration_ms=result["duration_ms"],
            size_bytes=result["size_bytes"],
            used_bridge=False,
        )
    )
    await db.commit()

    return result
