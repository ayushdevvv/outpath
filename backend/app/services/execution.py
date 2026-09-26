"""
Executes one outbound HTTP request on the user's behalf.

This is the one place Outbox's server calls out to the internet, so every
constraint from the security brief lives here:
  - the URL is validated against private/internal ranges before connecting
  - redirects are not followed automatically (a redirect to a private
    address is exactly the DNS-rebinding-style bypass validate_outbound_url
    exists to prevent), each hop is re-validated instead
  - a hard timeout and a hard response-size cap always apply
  - nothing here ever proxies an arbitrary method/host pair without going
    through validation — there is no bypass path
"""

import time

import httpx

from app.config import get_settings
from app.security import SsrfBlocked, validate_outbound_url

settings = get_settings()

MAX_REDIRECTS = 5


class ExecutionError(Exception):
    def __init__(self, message: str, *, blocked: bool = False):
        self.message = message
        self.blocked = blocked
        super().__init__(message)


def _build_url(base_url: str, params: list[dict]) -> str:
    if not params:
        return base_url
    from urllib.parse import urlencode

    qs = urlencode([(p["key"], p["value"]) for p in params if p.get("key")])
    if not qs:
        return base_url
    sep = "&" if "?" in base_url else "?"
    return f"{base_url}{sep}{qs}"


def _apply_auth(headers: dict[str, str], params: list[dict], auth: dict) -> None:
    kind = auth.get("type", "none")
    if kind == "bearer" and auth.get("token"):
        headers["Authorization"] = f"Bearer {auth['token']}"
    elif kind == "basic" and (auth.get("username") or auth.get("password")):
        import base64

        raw = f"{auth.get('username', '')}:{auth.get('password', '')}".encode()
        headers["Authorization"] = f"Basic {base64.b64encode(raw).decode()}"
    elif kind == "apikey" and auth.get("key"):
        if auth.get("in_", auth.get("in", "header")) == "query":
            params.append({"key": auth["key"], "value": auth.get("value", "")})
        else:
            headers[auth["key"]] = auth.get("value", "")


async def execute_request(
    *, method: str, url: str, params: list[dict], headers: list[dict], auth: dict, body: str
) -> dict:
    header_map = {h["key"]: h["value"] for h in headers if h.get("key")}
    param_list = list(params)
    _apply_auth(header_map, param_list, auth)

    current_url = _build_url(url, param_list)
    started = time.perf_counter()

    async with httpx.AsyncClient(follow_redirects=False, timeout=settings.request_timeout_seconds) as client:
        for _ in range(MAX_REDIRECTS + 1):
            try:
                target = validate_outbound_url(current_url)
            except SsrfBlocked as exc:
                raise ExecutionError(exc.reason, blocked=True) from exc

            try:
                async with client.stream(
                    method,
                    target.url,
                    headers=header_map,
                    content=body.encode() if body and method not in ("GET", "DELETE") else None,
                ) as response:
                    if response.is_redirect and response.headers.get("location"):
                        next_url = str(response.next_request.url) if response.next_request else response.headers["location"]
                        try:
                            previous_origin = httpx.URL(target.url).copy_with(path="", query=None).human_repr()
                            next_origin = httpx.URL(next_url).copy_with(path="", query=None).human_repr()
                        except Exception:
                            previous_origin = next_origin = ""
                        if previous_origin != next_origin:
                            header_map = {
                                key: value
                                for key, value in header_map.items()
                                if key.lower() not in {"authorization", "proxy-authorization", "cookie"}
                                and not any(token in key.lower() for token in ("api-key", "apikey", "token", "secret", "password"))
                            }
                        current_url = next_url
                        continue

                    chunks: list[bytes] = []
                    captured = 0
                    truncated = False
                    async for chunk in response.aiter_bytes():
                        remaining = settings.max_response_bytes - captured
                        if remaining <= 0:
                            truncated = True
                            break
                        if len(chunk) > remaining:
                            chunks.append(chunk[:remaining])
                            captured += remaining
                            truncated = True
                            break
                        chunks.append(chunk)
                        captured += len(chunk)

                    body_bytes = b"".join(chunks)
                    duration_ms = round((time.perf_counter() - started) * 1000)
                    return {
                        "status": response.status_code,
                        "status_text": response.reason_phrase,
                        "duration_ms": duration_ms,
                        "size_bytes": captured,
                        "headers": dict(response.headers),
                        "body": body_bytes.decode(errors="replace"),
                        "truncated": truncated,
                    }
            except httpx.TimeoutException as exc:
                raise ExecutionError(
                    f"Timed out after {settings.request_timeout_seconds:.0f}s waiting for a response."
                ) from exc
            except httpx.ConnectError as exc:
                raise ExecutionError(f"Could not connect to {target.host}.") from exc
            except httpx.HTTPError as exc:
                raise ExecutionError(str(exc)) from exc

        raise ExecutionError("Too many redirects.")
