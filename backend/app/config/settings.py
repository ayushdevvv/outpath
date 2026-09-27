from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

                             
                                                                         
    database_url: str = "postgresql+asyncpg://outpath:outpath@localhost:5432/outpath"

                                                              
    secret_key: str = "change-me-in-production"
    session_cookie_name: str = "outpath_session"
    session_max_age_seconds: int = 60 * 60 * 24 * 14           

                                                                                                          
    allowed_origins: list[str] = [
        "https://outpath.vercel.app",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]

                                                                                  
    google_client_id: str = ""

                                                                          
    groq_api_key: str = ""
    groq_model: str = "openai/gpt-oss-120b"
    groq_timeout_seconds: float = 12.0

                                                               
    request_timeout_seconds: float = 15.0
    max_response_bytes: int = 5 * 1024 * 1024        
    rate_limit_per_minute: str = "60/minute"

    environment: str = "development"
                                                                        
                                                                          
    auto_migrate: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
