"""Redaction helpers. Applied before anything is logged or written to
request_history — secrets should never be recoverable from either place.
"""

SENSITIVE_HEADER_NAMES = {"authorization", "x-api-key", "cookie", "proxy-authorization"}


def redact_headers(headers: dict[str, str]) -> dict[str, str]:
    return {k: ("••••••••" if k.lower() in SENSITIVE_HEADER_NAMES else v) for k, v in headers.items()}


def redact_url_secrets(url: str, secret_values: set[str]) -> str:
    """Blanks out any known secret value (e.g. a resolved {{token}}) that
    appears in a URL, such as an API key sent as a query parameter."""
    out = url
    for value in secret_values:
        if value and len(value) >= 4:
            out = out.replace(value, "••••••••")
    return out
