from .auth import hash_password, issue_session_token, read_session_token, verify_password
from .ssrf import SsrfBlocked, ValidatedTarget, validate_outbound_url

__all__ = [
    "hash_password",
    "verify_password",
    "issue_session_token",
    "read_session_token",
    "SsrfBlocked",
    "ValidatedTarget",
    "validate_outbound_url",
    "get_current_user",
    "get_current_user_optional",
]


def __getattr__(name):
    # Deferred import: deps.py imports app.database/app.models, and importing
    # them eagerly here would create a circular import at package load time.
    if name in {"get_current_user", "get_current_user_optional"}:
        from . import deps

        return getattr(deps, name)
    raise AttributeError(name)
