# Publishing guide

How to release the npm packages and the editor extensions. The npm packages are
configured as **public scoped** packages (`publishConfig.access: "public"`,
Apache‑2.0).

## npm packages (`@xdarkoy/schema`, `@xdarkoy/designer`, `@xdarkoy/ai`)

### 0. Own the scope
You can only publish `@xdarkoy/*` if you own an npm **organization** named
`reporting` (free for public packages — create it at
<https://www.npmjs.com/org/create>). To publish under a different scope, rename
the three package names + their internal deps + every `@xdarkoy/...` import in
the repo (apps, the VS Code webview, the Vite aliases), then proceed.

### 1. Log in
```bash
npm login            # or: npm whoami  to confirm
```

### 2. Build
```bash
npm run build --workspace packages/schema --workspace packages/designer --workspace packages/ai
```

### 3. Dry‑run (no auth needed — inspect the tarballs)
```bash
npm publish --dry-run --workspace packages/schema
npm publish --dry-run --workspace packages/designer
npm publish --dry-run --workspace packages/ai
```
Each tarball should contain `dist/` (js + `.d.ts`), the `README.md`, the
`package.json` and the license.

### 4. Publish — schema first
`designer` and `ai` declare `@xdarkoy/schema` as a dependency, so it must
exist on the registry first.
```bash
npm publish --workspace packages/schema
npm publish --workspace packages/designer
npm publish --workspace packages/ai
```
`access: public` is set in `publishConfig`, so no `--access` flag is needed.

### 5. Verify
```bash
npm view @xdarkoy/designer version
# in a throwaway app:
npm create vite@latest demo -- --template react-ts && cd demo
npm i react react-dom @xdarkoy/designer @xdarkoy/schema @xdarkoy/ai
```

### Versioning
Bump versions before re‑publishing (npm forbids overwriting a published
version). Keep the three in lockstep and update the internal `@xdarkoy/schema`
dependency range in `designer`/`ai`.

## VS Code extension (`.vsix`)

The host is bundled (esbuild) so the VSIX is self‑contained.
```bash
npm run build --workspace apps/vscode-extension
cd apps/vscode-extension
npx vsce package --no-dependencies        # -> reporting-vscode-0.1.0.vsix (non‑interactive)
# install locally:
code --install-extension reporting-vscode-0.1.0.vsix
# or publish to the Marketplace (needs a publisher + PAT):
npx vsce publish
```

## Visual Studio 2022 extension (VSIX)

Needs the **"Visual Studio extension development"** workload.
```powershell
pwsh scripts/build-webview.ps1     # build the React webview + copy into Resources/webview
```
Then build `extensions/visualstudio/ReportDesigner.VsExtension.csproj` in VS 2022
(Build → produces `bin/Debug/ReportDesigner.VsExtension.vsix`) and double‑click
the `.vsix` to install.

## Python backend

Distributed as source (FastAPI + ReportLab). Run behind an authenticating
reverse proxy before exposing beyond localhost; see
[USAGE §16](./USAGE.md#16-the-pdf-render-backend) for the security env vars.
