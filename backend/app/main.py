import logging
import subprocess
import sys
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import HTTPException as FastAPIHTTPException, RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded

from sqlalchemy import text

from app.config import get_settings
from app.database import engine
from app.middleware.rate_limit import limiter
from app.routes import auth, collections, environments, history, requests as requests_routes

settings = get_settings()

BACKEND_ROOT = Path(__file__).resolve().parent.parent

# Never log request bodies, tokens or passwords — see app/utils/redact.py for
# what gets written to the database, and keep the default logger free of them.
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logging.getLogger("httpx").setLevel(logging.WARNING)

app = FastAPI(title="Outpath API", version="0.1.0", docs_url="/api/docs" if settings.environment == "development" else None)

app.state.limiter = limiter


async def rate_limit_error_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"detail": "Too many requests. Please slow down and try again shortly.", "code": "rate_limited"},
        headers={"Retry-After": "60"},
    )


app.add_exception_handler(RateLimitExceeded, rate_limit_error_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
)


@app.middleware("http")
async def csrf_origin_guard(request: Request, call_next):
    if request.method in {"POST", "PUT", "PATCH", "DELETE"} and request.url.path.startswith("/api/"):
        origin = request.headers.get("origin")
        if origin and origin not in settings.allowed_origins:
            return JSONResponse(
                status_code=403,
                content={"detail": "Cross-origin request blocked.", "code": "csrf_origin_blocked"},
            )
    return await call_next(request)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    errors = [{"field": ".".join(str(p) for p in e["loc"][1:]), "msg": e["msg"]} for e in exc.errors()]
    return JSONResponse(status_code=422, content={"detail": errors, "code": "validation_error"})


@app.exception_handler(FastAPIHTTPException)
async def http_error_handler(request: Request, exc: FastAPIHTTPException):
    code_by_status = {
        400: "bad_request",
        401: "unauthorized",
        403: "forbidden",
        404: "not_found",
        409: "conflict",
        422: "validation_error",
        429: "rate_limited",
        500: "server_error",
        502: "upstream_error",
        503: "service_unavailable",
    }
    code = (exc.detail.get("code") if isinstance(exc.detail, dict) else None) or code_by_status.get(exc.status_code, f"http_{exc.status_code}")
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail, "code": code}, headers=exc.headers or None)


@app.exception_handler(Exception)
async def unhandled_error_handler(request: Request, exc: Exception):
    logging.getLogger("outpath").exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Something went wrong on our end.", "code": "server_error"})


@app.on_event("startup")
async def startup() -> None:
    logger = logging.getLogger("outpath")
    if settings.environment != "development" and settings.secret_key == "change-me-in-production":
        raise RuntimeError("SECRET_KEY must be changed before running Outpath in production.")
    if settings.auto_migrate:
        result = _run_alembic("upgrade", "head")
        if result.returncode != 0:
            logger.error("Database migration failed:\n%s", result.stderr or result.stdout)
            raise RuntimeError("Database migration failed. Run 'alembic upgrade head' and restart Outpath.")
        logger.info("Database schema is up to date.")
    else:
        logger.info("Automatic migrations disabled; schema must be migrated during deployment.")

    async with engine.begin() as conn:
        await conn.execute(text("SELECT 1"))


def _run_alembic(*args: str, timeout: int = 60) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        cwd=BACKEND_ROOT,
        capture_output=True,
        text=True,
        timeout=timeout,
    )


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.get("/api/ready")
async def ready():
    async with engine.begin() as conn:
        await conn.execute(text("SELECT 1"))
    return {"status": "ready"}



app.include_router(auth.router)
app.include_router(collections.router)
app.include_router(environments.router)
app.include_router(requests_routes.router)
app.include_router(history.router)
