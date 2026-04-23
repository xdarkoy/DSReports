using System;
using System.Runtime.InteropServices;
using System.Threading;
using Microsoft.VisualStudio.Shell;
using Microsoft.VisualStudio.Shell.Interop;
using Task = System.Threading.Tasks.Task;

namespace ReportDesigner.VsExtension
{
    /// <summary>
    /// Entry point for the VSIX. Registers the custom editor factory, the
    /// "New Report" command and the options page.
    /// </summary>
    [PackageRegistration(UseManagedResourcesOnly = true, AllowsBackgroundLoading = true)]
    [InstalledProductRegistration("Report Designer", "Moderner visueller Report Designer mit KI-Copilot", "0.1.0")]
    [Guid(PackageGuids.PackageString)]
    [ProvideAutoLoad(UIContextGuids80.NoSolution, PackageAutoLoadFlags.BackgroundLoad)]
    [ProvideMenuResource("Menus.ctmenu", 1)]
    [ProvideEditorFactory(typeof(ReportEditorFactory), 101,
        TrustLevel = __VSEDITORTRUSTLEVEL.ETL_AlwaysTrusted)]
    [ProvideEditorExtension(typeof(ReportEditorFactory), ".myreport", 100)]
    [ProvideEditorExtension(typeof(ReportEditorFactory), ".myreport.json", 100)]
    [ProvideEditorLogicalView(typeof(ReportEditorFactory), VSConstants.LOGVIEWID.Designer_string)]
    [ProvideOptionPage(typeof(OptionsPage), "Report Designer", "General", 0, 0, true)]
    public sealed class ReportDesignerPackage : AsyncPackage
    {
        protected override async Task InitializeAsync(CancellationToken cancellationToken, IProgress<ServiceProgressData> progress)
        {
            await JoinableTaskFactory.SwitchToMainThreadAsync(cancellationToken);
            RegisterEditorFactory(new ReportEditorFactory(this));
            await NewReportCommand.InitializeAsync(this);
        }

        /// <summary>Reads the Claude API key + model from the options page.</summary>
        public (string ApiKey, string Model, string BackendUrl) GetOptions()
        {
            var page = (OptionsPage)GetDialogPage(typeof(OptionsPage));
            return (page.AnthropicApiKey ?? string.Empty,
                    string.IsNullOrWhiteSpace(page.Model) ? "claude-sonnet-4-6" : page.Model,
                    string.IsNullOrWhiteSpace(page.BackendUrl) ? "http://localhost:8787/render" : page.BackendUrl);
        }
    }

    internal static class PackageGuids
    {
        public const string PackageString = "6cf4b0df-98a0-4c6a-9d3a-8fb13d89f7f5";
        public const string EditorFactoryString = "d4c3a2b1-a40b-4f75-9dcf-76e5c8f15c9e";
        public const string CmdSetString = "b2f49c3d-d1ab-4c09-8f5e-65c05c2d3a11";
        public static readonly Guid Package = new Guid(PackageString);
        public static readonly Guid EditorFactory = new Guid(EditorFactoryString);
        public static readonly Guid CmdSet = new Guid(CmdSetString);
        public const int NewReportCmdId = 0x0100;
    }
}
