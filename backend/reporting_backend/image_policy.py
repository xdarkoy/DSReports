"""Image-source security policy for the renderer.

A report document is fully attacker-controlled, and image elements carry an
arbitrary ``source`` string. Without restrictions, ReportLab would happily
open local files (``C:\\secret.png``, ``/etc/...``) or fetch internal URLs
(``http://169.254.169.254/...``) and embed them in the returned PDF — i.e.
local-file disclosure and SSRF.

This module loads image bytes under an explicit policy:

  * ``data:`` URIs are always allowed (they carry their own bytes).
  * ``http(s)`` URLs are allowed only when the host is on an allowlist AND
    does not resolve to a private/loopback/link-local address. Responses are
    capped in size and time.
  * Everything else (local paths, ``file://``, ``ftp://`` …) is refused.

Remote fetching is disabled by default; configure it via the environment:

    REPORT_IMAGE_ALLOW_REMOTE=1
    REPORT_IMAGE_HOST_ALLOWLIST=cdn.example.com,assets.example.com
    REPORT_IMAGE_MAX_BYTES=5242880
"""
from __future__ import annotations

import ipaddress
import os
import socket
from dataclasses import dataclass, field
from typing import Optional, Set
from urllib.parse import urlparse

try:  # requests is a declared dependency, but keep the import defensive
    import requests
except ImportError:  # pragma: no cover
    requests = None  # type: ignore


@dataclass
class ImagePolicy:
    allow_remote: bool = False
    host_allowlist: Set[str] = field(default_factory=set)
    max_bytes: int = 5 * 1024 * 1024
    timeout_seconds: float = 5.0

    def load(self, src: str) -> Optional[bytes]:
        """Return image bytes for ``src`` if permitted, else ``None``."""
        if not src:
            return None
        if src.startswith("data:"):
            return _decode_data_uri(src)
        parsed = urlparse(src)
        if parsed.scheme not in ("http", "https"):
            return None  # local paths, file://, etc. are never allowed
        if not self.allow_remote or requests is None:
            return None
        host = (parsed.hostname or "").lower()
        if host not in self.host_allowlist:
            return None
        if not _host_is_public(host):
            return None
        return self._fetch(src)

    def _fetch(self, url: str) -> Optional[bytes]:
        try:
            resp = requests.get(url, timeout=self.timeout_seconds, stream=True)
            resp.raise_for_status()
            data = bytearray()
            for chunk in resp.iter_content(8192):
                data.extend(chunk)
                if len(data) > self.max_bytes:
                    return None
            return bytes(data)
        except Exception:
            return None


def _decode_data_uri(src: str) -> Optional[bytes]:
    try:
        _, b64 = src.split(",", 1)
        import base64

        return base64.b64decode(b64)
    except Exception:
        return None


def _host_is_public(host: str) -> bool:
    """Reject hosts that resolve to private, loopback or link-local IPs."""
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        return False
    for info in infos:
        addr = info[4][0]
        try:
            ip = ipaddress.ip_address(addr)
        except ValueError:
            return False
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
            return False
    return True


def default_image_policy() -> ImagePolicy:
    allow = os.environ.get("REPORT_IMAGE_ALLOW_REMOTE", "").lower() in ("1", "true", "yes")
    hosts = {
        h.strip().lower()
        for h in os.environ.get("REPORT_IMAGE_HOST_ALLOWLIST", "").split(",")
        if h.strip()
    }
    try:
        max_bytes = int(os.environ.get("REPORT_IMAGE_MAX_BYTES", "5242880"))
    except ValueError:
        max_bytes = 5 * 1024 * 1024
    return ImagePolicy(allow_remote=allow, host_allowlist=hosts, max_bytes=max_bytes)
