import uuid
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.models import User
from app.middleware.rate_limit import limiter
from app.schemas import AuthSessionOut, GoogleCredentialIn, LoginIn, RegisterIn, UserOut
from app.security import get_current_user, hash_password, issue_session_token, verify_password

                                                                           
                                                                    
_google_auth_request = google_requests.Request()

router = APIRouter(prefix="/api/auth", tags=["auth"])
settings = get_settings()


def _session_cookie_options() -> dict:
                                                                            
                                                                           
                                                                           
                  
    production = settings.environment != "development"
    return {
        "secure": production,
        "samesite": "none" if production else "lax",
        "httponly": True,
        "path": "/",
    }


def _create_session(response: Response, user_id: uuid.UUID) -> str:
    token = issue_session_token(user_id)
    response.set_cookie(
        settings.session_cookie_name,
        token,
        max_age=settings.session_max_age_seconds,
        **_session_cookie_options(),
    )
    return token


@router.post("/register", response_model=AuthSessionOut)
@limiter.limit("5/hour")
async def register(request: Request, payload: RegisterIn, response: Response, db: AsyncSession = Depends(get_db)):
    email = str(payload.email).strip().lower()
    existing = await db.scalar(select(User).where(User.email == email))
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists.")

    user = User(name=payload.name.strip(), email=email, password_hash=hash_password(payload.password))
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = _create_session(response, user.id)
    return {"user": user, "session_token": token}


@router.post("/login", response_model=AuthSessionOut)
@limiter.limit("10/minute")
async def login(request: Request, payload: LoginIn, response: Response, db: AsyncSession = Depends(get_db)):
    email = str(payload.email).strip().lower()
    user = await db.scalar(select(User).where(User.email == email))
    if not user or not user.password_hash or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "That email and password don't match.")

    token = _create_session(response, user.id)
    return {"user": user, "session_token": token}


@router.post("/logout")
async def logout(response: Response):
    options = _session_cookie_options()
    response.delete_cookie(
        settings.session_cookie_name,
        path=options["path"],
        secure=options["secure"],
        httponly=options["httponly"],
        samesite=options["samesite"],
    )
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)):
    return user


                                                                                    

@router.post("/google", response_model=AuthSessionOut)
@limiter.limit("10/minute")
async def google_verify(
    request: Request,
    payload: GoogleCredentialIn,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    """
    Cloud-equivalent Google sign-in flow for Outpath:

    1. The browser obtains a Google ID token through Google Identity Services.
    2. FastAPI verifies that signed ID token against Outpath's Web Client ID.
    3. We identify the Outpath user by normalized email.
    4. If the email does not exist, create the user as an OAuth-only account.
    5. Issue the same Outpath session used by normal email/password login.

    We intentionally do not maintain a second Google-linking state machine here.
    The working Cloud project uses the user's email as the canonical account
    identity, which also means an existing Outpath email account can continue
    to use the same account when Google is used later.
    """
    if not settings.google_client_id:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Google sign-in is not configured.",
        )

    try:
        info = google_id_token.verify_oauth2_token(
            payload.credential,
            _google_auth_request,
            settings.google_client_id,
        )
    except ValueError:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Google sign-in could not be verified.",
        )
    except Exception as exc:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "Google sign-in could not be verified right now.",
        ) from exc

    issuer = str(info.get("iss") or "").strip()
    if issuer not in {"accounts.google.com", "https://accounts.google.com"}:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Google sign-in could not be verified.",
        )

    if str(info.get("email_verified", "")).lower() not in {"true", "1"}:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Your Google email is not verified.",
        )

    email = str(info.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Google account information is incomplete.",
        )

    name = str(info.get("name") or email.split("@")[0] or "Outpath user").strip()[:120]

                                                                              
                                                                             
                                                                               
                                                
    user = await db.scalar(select(User).where(User.email == email))

    if user is None:
        create_user = (
            pg_insert(User)
            .values(id=uuid.uuid4(), name=name, email=email, password_hash=None)
            .on_conflict_do_nothing(index_elements=["email"])
        )
        await db.execute(create_user)
        user = await db.scalar(select(User).where(User.email == email))

    if user is None:
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "Could not create your account. Please try again.",
        )

    await db.commit()
    token = _create_session(response, user.id)
    return {"user": user, "session_token": token}


                                                                               
@router.post("/google/verify", response_model=AuthSessionOut, include_in_schema=False)
@limiter.limit("10/minute")
async def google_verify_legacy(
    request: Request,
    payload: GoogleCredentialIn,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    return await google_verify(request, payload, response, db)
