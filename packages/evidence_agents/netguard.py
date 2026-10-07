"""URL safety for user-supplied links (SSRF guard): only public http(s) hosts are accepted."""

from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse


class UnsafeURL(ValueError):
    pass


def _is_public(ip: str) -> bool:
    addr = ipaddress.ip_address(ip)
    return not (addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_reserved
                or addr.is_multicast or addr.is_unspecified)


def check_public_url(url: str, resolve: bool = True) -> str:
    parsed = urlparse(url.strip())
    if parsed.scheme not in ("http", "https"):
        raise UnsafeURL("Only http and https links are allowed")
    host = parsed.hostname
    if not host:
        raise UnsafeURL("Link has no host")
    if parsed.username or parsed.password:
        raise UnsafeURL("Links with embedded credentials are not allowed")
    if host.lower() in ("localhost", "metadata.google.internal") or host.endswith(".local") or host.endswith(".internal"):
        raise UnsafeURL("Private hosts are not allowed")
    try:
        literal_ip = _is_public(host)
    except ValueError:
        literal_ip = None
    if literal_ip is False:
        raise UnsafeURL("Private network addresses are not allowed")
    if literal_ip is None:
        if resolve:
            try:
                infos = socket.getaddrinfo(host, None)
            except socket.gaierror as exc:
                raise UnsafeURL("Host does not resolve") from exc
            if any(not _is_public(info[4][0]) for info in infos):
                raise UnsafeURL("Host resolves to a private network address")
    return url.strip()
