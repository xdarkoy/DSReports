using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using Microsoft.VisualStudio;
using Microsoft.VisualStudio.OLE.Interop;
using Microsoft.VisualStudio.Shell;
using Microsoft.VisualStudio.Shell.Interop;
using IServiceProvider = Microsoft.VisualStudio.OLE.Interop.IServiceProvider;

namespace ReportDesigner.VsExtension
{
    /// <summary>
    /// Hosts the WebView that renders the React designer and routes save/load
    /// between the webview and the file on disk. Implements the bare-minimum
    /// VS doc-data interfaces so save/dirty tracking works in the shell.
    /// </summary>
    public sealed class ReportEditorPane : WindowPane, IVsPersistDocData, IPersistFileFormat
    {
        private readonly ReportDesignerPackage _package;
        private readonly string _filePath;
        private readonly WebViewHost _host;
        private bool _dirty;

        public ReportEditorPane(ReportDesignerPackage package, string filePath) : base(null)
        {
            _package = package;
            _filePath = filePath;
            _host = new WebViewHost(package);
            _host.DocumentChanged += (_, __) => _dirty = true;
            _host.SaveRequested += (_, json) => SaveToDisk(json);
            _host.LoadFileAsync(_filePath);
        }

        public override IWin32Window Window => _host;

        // ---- IPersistFileFormat ----------------------------------------------------
        public int GetClassID(out Guid pClassID) { pClassID = PackageGuids.EditorFactory; return VSConstants.S_OK; }
        public int GetCurFile(out string ppszFilename, out uint pnFormatIndex) { ppszFilename = _filePath; pnFormatIndex = 0; return VSConstants.S_OK; }
        public int GetFormatList(out string ppszFormatList) { ppszFormatList = "Report Document (*.myreport)\n*.myreport\n"; return VSConstants.S_OK; }
        public int InitNew(uint nFormatIndex) => VSConstants.S_OK;
        public int Load(string pszFilename, uint grfMode, int fReadOnly) { _host.LoadFileAsync(pszFilename ?? _filePath); return VSConstants.S_OK; }
        public int Save(string pszFilename, int fRemember, uint nFormatIndex)
        {
            _host.RequestSerializeAsync(pszFilename ?? _filePath);
            return VSConstants.S_OK;
        }
        public int SaveCompleted(string pszFilename) { _dirty = false; return VSConstants.S_OK; }
        public int IsDirty(out int pfIsDirty) { pfIsDirty = _dirty ? 1 : 0; return VSConstants.S_OK; }

        // ---- IVsPersistDocData -----------------------------------------------------
        public int GetGuidEditorType(out Guid pClassID) { pClassID = PackageGuids.EditorFactory; return VSConstants.S_OK; }
        public int IsDocDataDirty(out int pfDirty) { pfDirty = _dirty ? 1 : 0; return VSConstants.S_OK; }
        public int SetUntitledDocPath(string pszDocDataPath) => VSConstants.S_OK;
        public int LoadDocData(string pszMkDocument) { _host.LoadFileAsync(pszMkDocument); return VSConstants.S_OK; }
        public int SaveDocData(VSSAVEFLAGS dwSave, out string pbstrMkDocumentNew, out int pfSaveCanceled)
        {
            pbstrMkDocumentNew = _filePath;
            pfSaveCanceled = 0;
            _host.RequestSerializeAsync(_filePath);
            return VSConstants.S_OK;
        }
        public int Close() => VSConstants.S_OK;
        public int OnRegisterDocData(uint docCookie, IVsHierarchy pHierNew, uint itemidNew) => VSConstants.S_OK;
        public int RenameDocData(uint grfAttribs, IVsHierarchy pHierNew, uint itemidNew, string pszMkDocumentNew) => VSConstants.S_OK;
        public int IsDocDataReloadable(out int pfReloadable) { pfReloadable = 1; return VSConstants.S_OK; }
        public int ReloadDocData(uint grfFlags) { _host.LoadFileAsync(_filePath); return VSConstants.S_OK; }

        private void SaveToDisk(string json)
        {
            try
            {
                File.WriteAllText(_filePath, json);
                _dirty = false;
            }
            catch (Exception ex)
            {
                MessageBox.Show("Speichern fehlgeschlagen: " + ex.Message, "Report Designer",
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
    }
}
