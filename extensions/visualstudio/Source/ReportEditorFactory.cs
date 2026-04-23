using System;
using System.Runtime.InteropServices;
using Microsoft.VisualStudio;
using Microsoft.VisualStudio.Shell;
using Microsoft.VisualStudio.Shell.Interop;

namespace ReportDesigner.VsExtension
{
    [Guid(PackageGuids.EditorFactoryString)]
    public sealed class ReportEditorFactory : IVsEditorFactory, IDisposable
    {
        private readonly ReportDesignerPackage _package;
        private ServiceProvider _serviceProvider;

        public ReportEditorFactory(ReportDesignerPackage package) => _package = package;

        public int SetSite(Microsoft.VisualStudio.OLE.Interop.IServiceProvider psp)
        {
            _serviceProvider = new ServiceProvider(psp);
            return VSConstants.S_OK;
        }

        public int Close() { Dispose(); return VSConstants.S_OK; }

        public int MapLogicalView(ref Guid rguidLogicalView, out string pbstrPhysicalView)
        {
            pbstrPhysicalView = null;
            return rguidLogicalView == VSConstants.LOGVIEWID_Primary || rguidLogicalView == VSConstants.LOGVIEWID_Designer
                ? VSConstants.S_OK : VSConstants.E_NOTIMPL;
        }

        public int CreateEditorInstance(
            uint grfCreateDoc, string pszMkDocument, string pszPhysicalView,
            IVsHierarchy pvHier, uint itemid, IntPtr punkDocDataExisting,
            out IntPtr ppunkDocView, out IntPtr ppunkDocData, out string pbstrEditorCaption,
            out Guid pguidCmdUI, out int pgrfCDW)
        {
            pbstrEditorCaption = "";
            pguidCmdUI = PackageGuids.EditorFactory;
            pgrfCDW = 0;
            ppunkDocData = IntPtr.Zero;
            ppunkDocView = IntPtr.Zero;

            var pane = new ReportEditorPane(_package, pszMkDocument);
            ppunkDocView = Marshal.GetIUnknownForObject(pane);
            ppunkDocData = Marshal.GetIUnknownForObject(pane);
            pbstrEditorCaption = System.IO.Path.GetFileName(pszMkDocument);
            return VSConstants.S_OK;
        }

        public void Dispose()
        {
            _serviceProvider?.Dispose();
            _serviceProvider = null;
        }
    }
}
