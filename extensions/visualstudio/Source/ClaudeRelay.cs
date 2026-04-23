using System;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace ReportDesigner.VsExtension
{
    /// <summary>
    /// Proxies Claude API calls and render-backend calls on behalf of the
    /// webview so the API key never leaves the extension host.
    /// </summary>
    internal static class ClaudeRelay
    {
        private static readonly HttpClient Http = new HttpClient();

        public static async Task<(int Id, object Result, string Error)> AskAsync(ReportDesignerPackage pkg, JObject msg)
        {
            var id = (int)(msg["id"] ?? 0);
            try
            {
                var (apiKey, model, _) = pkg.GetOptions();
                if (string.IsNullOrEmpty(apiKey)) throw new InvalidOperationException("Configure Tools › Options › Report Designer › Anthropic API Key.");

                var payload = msg["payload"] ?? new JObject();
                var action = (string)payload["action"] ?? "generate";
                var body = BuildRequest(action, payload["payload"], model);

                using (var req = new HttpRequestMessage(HttpMethod.Post, "https://api.anthropic.com/v1/messages"))
                {
                    req.Headers.Add("x-api-key", apiKey);
                    req.Headers.Add("anthropic-version", "2023-06-01");
                    req.Content = new StringContent(body, Encoding.UTF8, "application/json");
                    using (var res = await Http.SendAsync(req))
                    {
                        var txt = await res.Content.ReadAsStringAsync();
                        if (!res.IsSuccessStatusCode) throw new Exception("Claude: " + (int)res.StatusCode + " " + txt);
                        var j = JObject.Parse(txt);
                        var content = (JArray)j["content"];
                        var combined = "";
                        foreach (var c in content) combined += (string)c["text"] ?? "";
                        return (id, new { action, text = combined }, null);
                    }
                }
            }
            catch (Exception ex)
            {
                return (id, null, ex.Message);
            }
        }

        public static async Task PreviewAsync(ReportDesignerPackage pkg, JToken doc)
        {
            try
            {
                var (_, _, backend) = pkg.GetOptions();
                using (var req = new HttpRequestMessage(HttpMethod.Post, backend))
                {
                    req.Content = new StringContent(doc?.ToString(Formatting.None) ?? "{}", Encoding.UTF8, "application/json");
                    using (var res = await Http.SendAsync(req))
                    {
                        if (!res.IsSuccessStatusCode) throw new Exception("Backend: " + (int)res.StatusCode);
                        var tmp = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "report-preview-" + DateTime.Now.Ticks + ".pdf");
                        System.IO.File.WriteAllBytes(tmp, await res.Content.ReadAsByteArrayAsync());
                        System.Diagnostics.Process.Start(tmp);
                    }
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show("Preview failed: " + ex.Message, "Report Designer",
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private static string BuildRequest(string action, JToken payload, string model)
        {
            const string sys =
                "You are a report layout assistant. Respond with ONLY JSON (no markdown). " +
                "Coordinates in millimetres, A4 portrait by default, bands: pageHeader/body/pageFooter. " +
                "Element types: text,image,rectangle,line,barcode,table,chart,pagebreak.";
            string user;
            switch (action)
            {
                case "restyle":
                    user = "Restyle the following report, keep layout/bindings, change only visual props: \""
                         + (string)payload?["prompt"] + "\".\n\n" + payload?["doc"]?.ToString(Formatting.None);
                    break;
                case "map":
                    user = "Propose a JSON array of ReportElement objects to visualize this data:\n"
                         + payload?["sample"]?.ToString(Formatting.None);
                    break;
                default:
                    user = "Generate a ReportDocument for: \""
                         + (string)payload?["prompt"] + "\".\n\nSample data: "
                         + (payload?["sampleData"]?.ToString(Formatting.None) ?? "null");
                    break;
            }
            return JsonConvert.SerializeObject(new
            {
                model,
                max_tokens = 4096,
                system = sys,
                messages = new[] { new { role = "user", content = user } },
            });
        }
    }
}
