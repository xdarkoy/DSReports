"""HTTP server exposing POST /render → PDF."""
from __future__ import annotations

from typing import Any

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from .renderer import render_report_to_pdf

app = FastAPI(title="Report Designer Render Service", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/")
def root() -> dict[str, str]:
    return {"service": "report-render", "version": "0.1.0"}


@app.post("/render")
async def render(req: Request) -> Response:
    body: Any = await req.json()
    doc = body.get("document") if isinstance(body, dict) and "document" in body else body
    data = body.get("data") if isinstance(body, dict) and "data" in body else None
    pdf = render_report_to_pdf(doc, data)
    return Response(content=pdf, media_type="application/pdf")


def main() -> None:  # `python -m reporting_backend.server`
    import uvicorn
    uvicorn.run("reporting_backend.server:app", host="127.0.0.1", port=8787, reload=False)


if __name__ == "__main__":
    main()
