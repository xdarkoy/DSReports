"""HTTP server exposing POST /render → PDF.

The renderer consumes fully untrusted report documents, so this service is
locked down by default:

  * It binds to loopback (127.0.0.1) only.
  * CORS is restricted to an explicit origin allowlist
    (``REPORT_CORS_ORIGINS``, comma-separated; defaults to common localhost
    dev origins). It does **not** use ``*``.
  * Image fetching is governed by ``ImagePolicy`` (remote disabled unless
    configured); see ``image_policy.py``.

Run behind an authenticating reverse proxy before exposing it beyond
localhost.
"""
from __future__ import annotations

import logging
import os
from typing import Any

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from .image_policy import default_image_policy
from .renderer import render_report_to_pdf

logger = logging.getLogger("reporting_backend")

_DEFAULT_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173"


def _cors_origins() -> list[str]:
    raw = os.environ.get("REPORT_CORS_ORIGINS", _DEFAULT_ORIGINS)
    return [o.strip() for o in raw.split(",") if o.strip()]


app = FastAPI(title="Report Designer Render Service", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_methods=["POST", "OPTIONS"],
    allow_headers=["content-type"],
)

# Built once; reads REPORT_IMAGE_* env vars.
_IMAGE_POLICY = default_image_policy()


@app.get("/")
def root() -> dict[str, str]:
    return {"service": "report-render", "version": "0.1.0"}


@app.post("/render")
async def render(req: Request) -> Response:
    try:
        body: Any = await req.json()
    except Exception:
        return Response(content="invalid JSON body", status_code=400, media_type="text/plain")

    doc = body.get("document") if isinstance(body, dict) and "document" in body else body
    data = body.get("data") if isinstance(body, dict) and "data" in body else None

    if not isinstance(doc, dict):
        return Response(content="document must be a JSON object", status_code=400, media_type="text/plain")

    try:
        pdf = render_report_to_pdf(doc, data, image_policy=_IMAGE_POLICY)
    except ValueError as exc:
        return Response(content=str(exc), status_code=400, media_type="text/plain")
    except Exception:  # never leak a stack trace to the client
        logger.exception("render failed")
        return Response(content="render failed", status_code=500, media_type="text/plain")

    return Response(content=pdf, media_type="application/pdf")


def main() -> None:  # `python -m reporting_backend.server`
    import uvicorn
    uvicorn.run("reporting_backend.server:app", host="127.0.0.1", port=8787, reload=False)


if __name__ == "__main__":
    main()
