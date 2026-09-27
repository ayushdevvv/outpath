import uuid

from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from passlib.context import CryptContext

from app.config import get_settings

settings = get_settings()

                                                                                    
_pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")

_serializer = URLSafeTimedSerializer(settings.secret_key, salt="outpath-session")


def hash_password(raw: str) -> str:
    return _pwd_context.hash(raw)


def verify_password(raw: str, hashed: str) -> bool:
    return _pwd_context.verify(raw, hashed)


def issue_session_token(user_id: uuid.UUID) -> str:
    return _serializer.dumps({"uid": str(user_id)})


def read_session_token(token: str) -> uuid.UUID | None:
    """Returns the user id if the token is valid and unexpired, else None.
    Never raises — a bad or stale cookie should just mean "not signed in".
    """
    try:
        data = _serializer.loads(token, max_age=settings.session_max_age_seconds)
        return uuid.UUID(data["uid"])
    except (BadSignature, SignatureExpired, KeyError, ValueError):
        return None
