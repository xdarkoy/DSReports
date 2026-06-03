using System;
using System.IO;
using System.Reflection;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace ReportDesigner.VsExtension
{
    /// <summary>
    /// Hosts a WebView2 control, loads the bundled designer (React) and
    /// bridges postMessage traffic to the enclosing editor.
    /// </summary>
    public sealed class WebViewHost : UserControl
    {
        private readonly ReportDesignerPackage _package;
        private readonly WebView2 _web = new WebView2 { Dock = DockStyle.Fill };
        private string _filePath;

        public event EventHandler DocumentChanged;
        public event EventHandler<string> SaveRequested;

        public WebViewHost(ReportDesignerPackage package)
        {
            _package = package;
            Controls.Add(_web);
            Load += async (_, __) => await InitAsync();
        }

        private async Task InitAsync()
        {
            var userDir = Path.Combine(Path.GetTempPath(), "ReportDesignerVS");
            Directory.CreateDirectory(userDir);
            var env = await CoreWebView2Environment.CreateAsync(null, userDir);
            await _web.EnsureCoreWebView2Async(env);

            var resRoot = ResolveResourcesRoot();
            _web.CoreWebView2.SetVirtualHostNameToFolderMapping(
                "designer.local", resRoot, CoreWebView2HostResourceAccessKind.Allow);

            _web.CoreWebView2.WebMessageReceived += OnMessage;
            _web.Source = new Uri("http://designer.local/index.html");
        }

        private string ResolveResourcesRoot()
        {
            var dir = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
            return Path.Combine(dir, "Resources", "webview");
        }

        private async void OnMessage(object sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            try
            {
                var msg = JObject.Parse(e.WebMessageAsJson);
                var type = (string)msg["type"];
                switch (type)
                {
                    case "ready":
                        await LoadFileAsync(_filePath);
                        SendConfig();
                        break;
                    case "change":
                        DocumentChanged?.Invoke(this, EventArgs.Empty);
                        break;
                    case "save":
                        var payload = msg["payload"]?.ToString(Formatting.Indented) ?? "{}";
                        SaveRequested?.Invoke(this, payload);
                        break;
                    case "preview":
                        await ClaudeRelay.PreviewAsync(_package, msg["payload"]);
                        break;
                    case "ai":
                        var (id, result, err) = await ClaudeRelay.AskAsync(_package, msg);
                        Post(new { type = "ai-result", payload = new { id, result, error = err } });
                        break;
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show("Webview error: " + ex.Message);
            }
        }

        public async Task LoadFileAsync(string path)
        {
            _filePath = path;
            if (_web?.CoreWebView2 == null) return;
            if (string.IsNullOrEmpty(path) || !File.Exists(path)) return;
            var json = File.ReadAllText(path);
            try { var _ = JObject.Parse(json); }
            catch { json = "{}"; }
            Post(new { type = "load", payload = JObject.Parse(json.Length == 0 ? "{}" : json) });
        }

        /// <summary>
        /// Synchronously read the current document from the webview (indented JSON),
        /// or null if the webview isn't ready. Used by the shell save path so the
        /// file is written before the save is reported complete.
        /// </summary>
        public async Task<string> GetDocumentJsonAsync()
        {
            if (_web?.CoreWebView2 == null) return null;
            var raw = await _web.CoreWebView2.ExecuteScriptAsync(
                "window.__rdGetDocument ? JSON.stringify(window.__rdGetDocument()) : null");
            if (string.IsNullOrEmpty(raw) || raw == "null") return null;
            // ExecuteScriptAsync JSON-encodes the return value; our script returns a
            // JSON string, so unwrap one level then pretty-print.
            var inner = JsonConvert.DeserializeObject<string>(raw);
            if (string.IsNullOrEmpty(inner)) return null;
            try { return JObject.Parse(inner).ToString(Formatting.Indented); }
            catch { return inner; }
        }

        private void SendConfig()
        {
            // The API key never leaves the extension host — Claude calls are
            // proxied via ClaudeRelay. The webview only needs to know whether a
            // key is configured (mirrors the VS Code extension).
            var (apiKey, model, backendUrl) = _package.GetOptions();
            Post(new { type = "config", payload = new { hasApiKey = !string.IsNullOrEmpty(apiKey), aiModel = model, backendUrl } });
        }

        private void Post(object payload)
        {
            if (_web?.CoreWebView2 == null) return;
            var json = JsonConvert.SerializeObject(payload);
            _web.CoreWebView2.PostWebMessageAsJson(json);
        }
    }
}
