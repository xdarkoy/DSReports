using System.ComponentModel;
using System.Runtime.InteropServices;
using Microsoft.VisualStudio.Shell;

namespace ReportDesigner.VsExtension
{
    [ComVisible(true)]
    [Guid("0b3c4f11-47e1-4f25-9d71-e83e91fdb2c8")]
    public sealed class OptionsPage : DialogPage
    {
        [Category("AI")]
        [DisplayName("Anthropic API Key")]
        [Description("Key used to call the Claude API from the AI copilot.")]
        public string AnthropicApiKey { get; set; } = "";

        [Category("AI")]
        [DisplayName("Claude model")]
        [Description("Model identifier. Defaults to claude-sonnet-4-6.")]
        public string Model { get; set; } = "claude-sonnet-4-6";

        [Category("Backend")]
        [DisplayName("Python render URL")]
        [Description("HTTP endpoint of the render service that turns a report document into a PDF.")]
        public string BackendUrl { get; set; } = "http://localhost:8787/render";
    }
}
