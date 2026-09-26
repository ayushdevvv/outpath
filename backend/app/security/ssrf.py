"""
Outpath's server executes requests on behalf of the user, which is exactly the
shape of a server-side request forgery vulnerability if left unchecked. This
module is the single gate every outbound request must pass through.

Anything that resolves to localhost or a private/link-local range is refused
here — those targets are only ever reachable through the browser extension's
local bridge, which runs on the user's own machine and never through us.
"""

import ipaddress
import socket
from dataclasses import dataclass
from urllib.parse import urlsplit

ALLOWED_SCHEMES = {"http", "https"}

# Cloud metadata endpoints — the classic SSRF target — blocked explicitly,
# not just via the private-range check, since 169.254.169.254 is link-local
# but callers sometimes special-case "public-looking" ranges by mistake.
_BLOCKED_HOSTS = {"169.254.169.254", "metadata.google.internal"}


class SsrfBlocked(Exception):
    def __init__(self, reason: str):
        self.reason = reason
        super().__init__(reason)


@dataclass
class ValidatedTarget:
    url: str
    host: str
    resolved_ip: str


def _is_disallowed_ip(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    return (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    )


def validate_outbound_url(raw_url: str) -> ValidatedTarget:
    """Raises SsrfBlocked if the URL must not be called from the server.
    Resolves the hostname and checks the *resolved* IP, not just the
    hostname string, so a DNS name that points at a private address is
    caught too (DNS rebinding).
    """
    parts = urlsplit(raw_url)

    if parts.scheme not in ALLOWED_SCHEMES:
        raise SsrfBlocked(f"Scheme '{parts.scheme}' is not allowed. Use http or https.")

    if parts.username or parts.password:
        raise SsrfBlocked("URLs with embedded credentials are not allowed.")

    host = parts.hostname
    if not host:
        raise SsrfBlocked("URL has no host.")

    host_lower = host.rstrip(".").lower()
    if host_lower in _BLOCKED_HOSTS or host_lower in {"localhost"}:
        raise SsrfBlocked(
            "This looks like a local or internal address. Send it through the local bridge instead."
        )

    try:
        # If the host is already a literal IP, this succeeds without a DNS lookup.
        ip = ipaddress.ip_address(host)
        if _is_disallowed_ip(ip):
            raise SsrfBlocked("This address is private or reserved and cannot be reached from Outpath.")
        resolved_ip = str(ip)
    except ValueError:
        # Hostname — resolve and check every returned address.
        try:
            infos = socket.getaddrinfo(host, parts.port or (443 if parts.scheme == "https" else 80))
        except socket.gaierror as exc:
            raise SsrfBlocked(f"Could not resolve host '{host}'.") from exc

        resolved_ip = None
        for family, _, _, _, sockaddr in infos:
            candidate = ipaddress.ip_address(sockaddr[0])
            if _is_disallowed_ip(candidate):
                raise SsrfBlocked(
                    "This host resolves to a private or internal address and cannot be reached from Outpath."
                )
            resolved_ip = resolved_ip or str(candidate)

        if resolved_ip is None:
            raise SsrfBlocked(f"Could not resolve host '{host}'.")

    return ValidatedTarget(url=raw_url, host=host, resolved_ip=resolved_ip)
