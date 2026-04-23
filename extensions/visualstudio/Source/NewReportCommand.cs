using System;
using System.ComponentModel.Design;
using System.IO;
using System.Windows.Forms;
using Microsoft.VisualStudio.Shell;
using Microsoft.VisualStudio.Shell.Interop;
using Task = System.Threading.Tasks.Task;

namespace ReportDesigner.VsExtension
{
    internal sealed class NewReportCommand
    {
        private readonly AsyncPackage _package;

        private NewReportCommand(AsyncPackage package, OleMenuCommandService cms)
        {
            _package = package;
            var cmdId = new CommandID(PackageGuids.CmdSet, PackageGuids.NewReportCmdId);
            var cmd = new MenuCommand(Execute, cmdId);
            cms.AddCommand(cmd);
        }

        public static async Task InitializeAsync(AsyncPackage package)
        {
            await ThreadHelper.JoinableTaskFactory.SwitchToMainThreadAsync();
            var cms = await package.GetServiceAsync(typeof(IMenuCommandService)) as OleMenuCommandService;
            if (cms != null) new NewReportCommand(package, cms);
        }

        private void Execute(object sender, EventArgs e)
        {
            ThreadHelper.ThrowIfNotOnUIThread();
            using (var dlg = new SaveFileDialog())
            {
                dlg.Filter = "Report Document (*.myreport.json)|*.myreport.json|Report Document (*.myreport)|*.myreport";
                dlg.Title = "New Report";
                dlg.FileName = "new-report.myreport.json";
                if (dlg.ShowDialog() != DialogResult.OK) return;
                File.WriteAllText(dlg.FileName, Template());
                var dte = (EnvDTE.DTE)Package.GetGlobalService(typeof(EnvDTE.DTE));
                dte?.ItemOperations.OpenFile(dlg.FileName);
            }
        }

        private static string Template()
        {
            return "{\n" +
                   "  \"schemaVersion\": \"1.0.0\",\n" +
                   "  \"meta\": { \"title\": \"New Report\" },\n" +
                   "  \"page\": { \"size\": \"A4\", \"orientation\": \"portrait\", \"margin\": { \"top\": 15, \"right\": 15, \"bottom\": 15, \"left\": 15 }, \"unit\": \"mm\" },\n" +
                   "  \"dataSources\": [],\n" +
                   "  \"parameters\": [],\n" +
                   "  \"bands\": [\n" +
                   "    { \"type\": \"pageHeader\", \"height\": 20, \"elements\": [] },\n" +
                   "    { \"type\": \"body\",       \"height\": 200, \"elements\": [] },\n" +
                   "    { \"type\": \"pageFooter\", \"height\": 15, \"elements\": [] }\n" +
                   "  ]\n" +
                   "}\n";
        }
    }
}
