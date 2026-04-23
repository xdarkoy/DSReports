# Report Designer – Visual Studio Extension (VSIX)

This project wires the React-based `@reporting/designer` into **Visual Studio
2022** via a native custom editor backed by WebView2.

## Build

1. Build the web bundle (from the repo root):
   ```bash
   npm run build --workspace apps/vscode-extension -- --webview-only
   ```
   That produces `designer.js` + `designer.css` in `apps/vscode-extension/media/`.

2. Copy the bundle into the VSIX resources folder:
   ```powershell
   Copy-Item apps/vscode-extension/media/* extensions/visualstudio/Resources/webview/ -Force
   ```

3. Open `ReportDesigner.VsExtension.csproj` in Visual Studio 2022 (Workloads:
   "Visual Studio extension development") and build.

4. The VSIX is produced in `bin/Debug/ReportDesigner.VsExtension.vsix`.
   Double-click to install, or press F5 to launch an experimental instance.

## Settings

`Tools → Options → Report Designer`:

 - **Anthropic API Key** – for the AI Copilot (optional).
 - **Claude model**        – defaults to `claude-sonnet-4-6`.
 - **Python render URL**   – HTTP endpoint that produces the final PDF.

## File association

The editor takes over `*.myreport` and `*.myreport.json`. Double-clicking
such a file opens the designer inside VS.
