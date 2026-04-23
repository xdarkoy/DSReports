# reporting-backend

Pure-Python render service. Input: a `ReportDocument` JSON (see
[packages/schema](../packages/schema)). Output: a PDF.

## Install

```bash
cd backend
python -m venv .venv
.venv/Scripts/activate       # Windows
# source .venv/bin/activate  # macOS / Linux
pip install -e .
```

## Run

```bash
python -m reporting_backend.server
# → http://127.0.0.1:8787
```

The designer (VS Code extension & Visual Studio extension) posts to `/render`
and displays the returned PDF.

## cURL test

```bash
curl -X POST http://127.0.0.1:8787/render \
     -H "content-type: application/json" \
     --data @example-document.json > out.pdf
```
