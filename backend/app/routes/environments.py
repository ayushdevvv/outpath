import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import Environment, EnvironmentVariable, User
from app.schemas import EnvironmentIn, EnvironmentOut, EnvVariablesIn
from app.security import get_current_user

router = APIRouter(prefix="/api/environments", tags=["environments"])


async def _owned_environment(env_id: uuid.UUID, user: User, db: AsyncSession) -> Environment:
    env = await db.scalar(
        select(Environment)
        .options(selectinload(Environment.variables))
        .where(Environment.id == env_id, Environment.user_id == user.id)
    )
    if not env:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Environment not found.")
    return env


@router.get("", response_model=list[EnvironmentOut])
async def list_environments(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    rows = await db.scalars(
        select(Environment)
        .options(selectinload(Environment.variables))
        .where(Environment.user_id == user.id)
        .order_by(Environment.position, Environment.created_at)
    )
    return rows.unique().all()


@router.post("", response_model=EnvironmentOut, status_code=status.HTTP_201_CREATED)
async def create_environment(
    payload: EnvironmentIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    existing = await db.scalar(
        select(Environment).where(Environment.user_id == user.id, Environment.name == payload.name)
    )
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "An environment with this name already exists.")

    env = Environment(user_id=user.id, name=payload.name)
    db.add(env)
    await db.commit()
    await db.refresh(env, attribute_names=["variables"])
    return env


@router.put("/{env_id}/variables", response_model=EnvironmentOut)
async def replace_variables(
    env_id: uuid.UUID,
    payload: EnvVariablesIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    env = await _owned_environment(env_id, user, db)

    for var in list(env.variables):
        await db.delete(var)
    await db.flush()

    for i, v in enumerate(payload.variables):
        db.add(
            EnvironmentVariable(
                environment_id=env.id, name=v.name, value=v.value, secret=v.secret, position=i
            )
        )

    await db.commit()
    await db.refresh(env, attribute_names=["variables"])
    return env


@router.delete("/{env_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_environment(
    env_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    env = await _owned_environment(env_id, user, db)
    await db.delete(env)
    await db.commit()
