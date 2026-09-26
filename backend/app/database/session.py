from collections.abc import AsyncGenerator

from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import get_settings

settings = get_settings()


def normalize_async_database_url(raw_url: str) -> str:
    """Normalize common PostgreSQL URLs for SQLAlchemy's asyncpg driver.

    Outpath uses SQLAlchemy's asyncio extension, so the URL must resolve to
    ``postgresql+asyncpg``. Provider generated PostgreSQL URLs can also contain
    options meant for libpq/psycopg, notably ``channel_binding`` and
    ``sslmode``. Passing ``channel_binding`` through to asyncpg causes:

        TypeError: connect() got an unexpected keyword argument 'channel_binding'

    We remove unsupported ``channel_binding`` and translate ``sslmode`` to
    asyncpg's ``ssl`` option.
    """
    url = make_url(raw_url.strip())

    if url.get_backend_name() != "postgresql":
        raise ValueError(
            "DATABASE_URL must be a PostgreSQL URL, for example "
            "postgresql+asyncpg://user:password@host/db"
        )

    query = dict(url.query)

    # libpq/psycopg connection URLs commonly include channel_binding=require.
    # asyncpg does not accept that keyword, so it must not reach the driver.
    query.pop("channel_binding", None)

    # PostgreSQL provider URLs often use sslmode=require. asyncpg expects
    # `ssl=require` instead. Preserve an explicitly supplied asyncpg `ssl`.
    sslmode = query.pop("sslmode", None)
    if "ssl" not in query and sslmode is not None:
        query["ssl"] = sslmode

    url = url.set(
        drivername="postgresql+asyncpg",
        query=query,
    )

    return url.render_as_string(hide_password=False)


DATABASE_URL = normalize_async_database_url(settings.database_url)

engine = create_async_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as session:
        yield session
