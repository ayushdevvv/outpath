import json
import re
from urllib.parse import urlsplit

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.config import get_settings
from app.middleware.rate_limit import limiter
from app.schemas import ErrorExplainIn, ErrorExplainOut
from app.security import get_current_user
from app.models import User

router = APIRouter(prefix="/api/ai", tags=["ai"])
settings = get_settings()

_SECRET_KEY_RE = re.compile(
    r"(authorization|cookie|set-cookie|password|passwd|secret|token|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret)"
    r"(\s*[=:]\s*)([^\s,;]+)",
    re.IGNORECASE,
)


def _safe_route(value: str) -> str:
    try:
        parsed = urlsplit(value)
        host = parsed.hostname or "unknown-host"
        path = parsed.path or "/"
        scheme = parsed.scheme or "http"
        return f"{scheme}://{host}{path}"[:1200]
    except Exception:
        return "unknown-route"


def _redact_body(value: str) -> str:
    if not value:
        return ""
    text = _SECRET_KEY_RE.sub(r"\1\2[REDACTED]", value)
    # Keep the model context intentionally small. Error bodies are useful for
    # diagnosis, but should never become an accidental full payload exfiltration
    # path.
    return text[:3000]


@limiter.limit("10/minute")
@router.post("/explain-error", response_model=ErrorExplainOut)
async def explain_error(
    request: Request,
    payload: ErrorExplainIn,
    user: User = Depends(get_current_user),
):
    if not settings.groq_api_key:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "AI error explanations are not configured on this Outpath deployment.",
        )

    route = _safe_route(payload.url)
    body = _redact_body(payload.response_body)
    status_line = f"{payload.status} {payload.status_text}".strip() if payload.status else "No HTTP response status"

    system = (
        "You are Outpath's API debugging copilot. Diagnose failed HTTP requests for developers. "
        "Use only the supplied method, route, status and safe response snippet. Never invent server behavior. "
        "Be concise and practical. Distinguish likely cause from certainty. "
        "Return ONLY valid JSON matching the supplied schema."
    )
    user_prompt = {
        "method": payload.method,
        "route": route,
        "status": status_line,
        "local_request": payload.local,
        "client_error": payload.error_message[:1200],
        "response_snippet": body,
        "task": "Explain what most likely went wrong and give 2-4 concrete next checks in Outpath.",
    }

    response_schema = {
        "type": "json_schema",
        "json_schema": {
            "name": "outpath_error_explanation",
            "strict": True,
            "schema": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "summary": {"type": "string"},
                    "likely_cause": {"type": "string"},
                    "next_steps": {"type": "array", "items": {"type": "string"}},
                    "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
                },
                "required": ["title", "summary", "likely_cause", "next_steps", "confidence"],
                "additionalProperties": False,
            },
        },
    }

    try:
        async with httpx.AsyncClient(timeout=settings.groq_timeout_seconds) as client:
            response = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.groq_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": settings.groq_model,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": json.dumps(user_prompt, ensure_ascii=False)},
                    ],
                    "temperature": 0.1,
                    "max_completion_tokens": 500,
                    "response_format": response_schema,
                },
            )
            response.raise_for_status()
            data = response.json()
            content = data["choices"][0]["message"]["content"]
            parsed = json.loads(content)
            return ErrorExplainOut.model_validate(parsed)
    except httpx.HTTPStatusError as exc:
        detail = "Groq could not generate an explanation right now."
        if exc.response.status_code == 429:
            detail = "Groq is rate-limited right now. The request itself is unaffected."
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail) from exc
    except (httpx.HTTPError, KeyError, IndexError, json.JSONDecodeError, ValueError) as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Groq error explanation is temporarily unavailable.") from exc
