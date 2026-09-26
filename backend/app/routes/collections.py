import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import ApiRequest, Collection, User
from app.schemas import CollectionIn, CollectionOut
from app.security import get_current_user

router = APIRouter(prefix="/api/collections", tags=["collections"])


async def _owned_collection(collection_id: uuid.UUID, user: User, db: AsyncSession) -> Collection:
    collection = await db.scalar(
        select(Collection)
        .options(selectinload(Collection.requests).selectinload(ApiRequest.assertions))
        .where(Collection.id == collection_id, Collection.user_id == user.id)
    )
    if not collection:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Collection not found.")
    return collection


@router.get("", response_model=list[CollectionOut])
async def list_collections(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    rows = await db.scalars(
        select(Collection)
        .options(selectinload(Collection.requests).selectinload(ApiRequest.assertions))
        .where(Collection.user_id == user.id)
        .order_by(Collection.position, Collection.created_at)
    )
    return rows.unique().all()


@router.post("", response_model=CollectionOut, status_code=status.HTTP_201_CREATED)
async def create_collection(
    payload: CollectionIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    existing = await db.scalar(
        select(Collection).where(Collection.user_id == user.id, Collection.name == payload.name)
    )
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "A collection with this name already exists.")

    collection = Collection(user_id=user.id, name=payload.name)
    db.add(collection)
    await db.commit()
    await db.refresh(collection, attribute_names=["requests"])
    return collection


@router.patch("/{collection_id}", response_model=CollectionOut)
async def rename_collection(
    collection_id: uuid.UUID,
    payload: CollectionIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    collection = await _owned_collection(collection_id, user, db)
    existing = await db.scalar(
        select(Collection.id).where(
            Collection.user_id == user.id,
            Collection.name == payload.name,
            Collection.id != collection.id,
        )
    )
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "A collection with this name already exists.")
    collection.name = payload.name
    await db.commit()
    await db.refresh(collection)
    return collection


@router.delete("/{collection_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_collection(
    collection_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    collection = await _owned_collection(collection_id, user, db)
    await db.delete(collection)
    await db.commit()
