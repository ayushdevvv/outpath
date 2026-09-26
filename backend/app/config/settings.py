from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Neon/Postgres. Example:
    # postgresql+asyncpg://user:pass@ep-xxx.neon.tech/outpath?ssl=require
    database_url: str = "postgresql+asyncpg://outpath:outpath@localhost:5432/outpath"

    # Session signing — set a long random value in production.
    secret_key: str = "change-me-in-production"
    session_cookie_name: str = "outpath_session"
    session_max_age_seconds: int = 60 * 60 * 24 * 14  # 14 days

    # CORS: only the web app's own origin(s) may send credentialed requests.
    allowed_origins: list[str] = ["http://localhost:5173"]

    # Google Identity Services client ID used to verify the React-issued ID token.
    google_client_id: str = ""

    # Outbound request execution limits — see security/ssrf.py.
    request_timeout_seconds: float = 15.0
    max_response_bytes: int = 5 * 1024 * 1024  # 5 MB
    rate_limit_per_minute: str = "60/minute"

    environment: str = "development"
    # Schema changes belong in the release/migration step in production.
    # Keep startup migrations available for local development convenience.
    auto_migrate: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
