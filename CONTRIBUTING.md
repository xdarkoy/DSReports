# Contributing

Thanks for your interest in the Reporting designer! This is an Apache‑2.0
monorepo with a React designer, a Python PDF backend, and VS Code / Visual
Studio hosts.

## Branch model
- **`development`** is the default branch and where all work happens.
- **`main`** is the protected release branch (maintainer‑merged only).

Please open pull requests **against `development`**, not `main`.

### Workflow for contributors
1. **Fork** the repo and clone your fork.
2. Branch off `development`: `git checkout -b feat/my-thing development`.
3. Make your change, keep it focused.
4. Run the checks (below) — they must pass.
5. Push and open a **PR targeting `development`**.

Maintainers periodically promote `development` → `main`.

## Setup
```bash
npm install                       # installs all workspaces

# web demo
npm run dev:web                   # http://localhost:5173

# PDF backend (Python ≥ 3.10)
cd backend && python -m venv .venv && .venv/Scripts/activate   # (Linux/macOS: source .venv/bin/activate)
pip install -e .
python -m reporting_backend.server                            # http://127.0.0.1:8787

# DB example
npm run dev:invoice               # http://localhost:5174  (start backend venv server.py too)
```

## Checks (run before pushing — CI runs the same)
```bash
npm run build                                         # all packages + apps must build
npx tsc --noEmit -p packages/designer/tsconfig.json   # type checks
npx tsc --noEmit -p packages/ai/tsconfig.json
npx tsc --noEmit -p apps/web/tsconfig.json

# backend smoke
cd backend && pip install -e . && python -c "from reporting_backend.renderer import render_report_to_pdf as r; print(r({'page':{'size':'A4','orientation':'portrait','margin':{'top':10,'right':10,'bottom':10,'left':10},'unit':'mm'},'bands':[]}, {})[:4])"

# VS extension (Windows + .NET SDK)
dotnet build extensions/visualstudio/ReportDesigner.VsExtension.csproj
```

## Conventions
- **Two evaluators stay in lockstep.** Any change to the expression/format/
  binding logic in `packages/designer/src/utils/` must be mirrored in
  `backend/reporting_backend/expression.py` (and vice versa). Keep the
  TS↔Python output identical.
- **Security:** never put API keys in code or settings; the Anthropic key lives
  in VS Code SecretStorage / a server relay. The `/render` backend treats
  documents as untrusted — validate inputs, keep the image/SSRF guards intact.
- **Docs:** user‑facing features go in [docs/USAGE.md](docs/USAGE.md); update
  the relevant package README.
- Match the surrounding code style; keep PRs small and reviewable.

## Where things are
- `packages/schema` – document types + helpers (the shared contract)
- `packages/designer` – the React component
- `packages/ai` – Claude bindings
- `apps/web` – standalone demo · `apps/vscode-extension` – VS Code editor
- `extensions/visualstudio` – VS 2022 VSIX
- `backend` – FastAPI + ReportLab PDF renderer
- `examples/invoice-app` – DB‑bound example

By contributing you agree your contributions are licensed under Apache‑2.0.
