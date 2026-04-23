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

        /// <summary>Asks the webview to push its current document back so we can persist it.</summary>
        public void RequestSerializeAsync(string path)
        {
            _filePath = path;
            Post(new { type = "serialize" });
        }

        private void SendConfig()
        {
            var (apiKey, model, backendUrl) = _package.GetOptions();
            Post(new { type = "config", payload = new { apiKey, aiModel = model, backendUrl } });
        }

        private void Post(object payload)
        {
            if (_web?.CoreWebView2 == null) return;
            var json = JsonConvert.SerializeObject(payload);
            _web.CoreWebView2.PostWebMessageAsJson(json);
        }
    }
}
