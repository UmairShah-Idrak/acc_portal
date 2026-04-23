import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, X, CheckCircle, AlertCircle, Folder } from 'lucide-react';
import api from '../../api/axios';

function formatBytes(b) {
  if (!b) return '0 B';
  const k = 1024, s = ['B','KB','MB','GB'];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return `${(b / Math.pow(k, i)).toFixed(1)} ${s[i]}`;
}

const BATCH = 100;

export default function UploadModal({ currentFolder, onClose, onUploaded, initialFiles = [] }) {
  const [files, setFiles] = useState(
    initialFiles.map(f => ({ file: f, status: 'pending', progress: 0, error: null }))
  );
  const [uploading, setUploading] = useState(false);
  const [stage, setStage] = useState(null); // null | 'creating_folders' | 'uploading' | 'done'
  const [stageProgress, setStageProgress] = useState({ current: 0, total: 0 });
  const [stageError, setStageError] = useState('');

  // Detect folder mode: webkitRelativePath is set (non-empty) when using webkitdirectory input
  const isFolderMode = files.length > 0 && !!files[0]?.file?.webkitRelativePath;
  const folderName = isFolderMode ? (files[0]?.file?.webkitRelativePath?.split('/')[0] || 'Folder') : '';
  const totalSize = files.reduce((sum, f) => sum + (f.file.size || 0), 0);
  const subfolderCount = isFolderMode
    ? new Set(
        files
          .map(({ file }) => {
            const parts = file.webkitRelativePath.split('/');
            return parts.length > 2 ? parts.slice(0, -1).join('/') : null;
          })
          .filter(Boolean)
      ).size
    : 0;

  const onDrop = useCallback(accepted => {
    if (isFolderMode) return;
    setFiles(prev => [
      ...prev,
      ...accepted.map(f => ({ file: f, status: 'pending', progress: 0, error: null })),
    ]);
  }, [isFolderMode]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, multiple: true });

  const removeFile = idx => setFiles(prev => prev.filter((_, i) => i !== idx));

  // ── Regular file upload ────────────────────────────────────────────────────
  const handleFileUpload = async () => {
    if (!files.length) return;
    setUploading(true);
    setStage('uploading');
    const allFiles = [...files];
    const uploadedItems = [];

    for (let i = 0; i < allFiles.length; i += BATCH) {
      const slice = allFiles.slice(i, i + BATCH);
      setStageProgress({ current: i, total: allFiles.length });
      setFiles(prev => prev.map((f, idx) =>
        idx >= i && idx < i + BATCH ? { ...f, status: 'uploading' } : f
      ));

      const formData = new FormData();
      slice.forEach(f => formData.append('files', f.file));
      if (currentFolder) formData.append('parent', currentFolder);

      try {
        const r = await api.post('/files/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: e => {
            const pct = Math.round((e.loaded / e.total) * 100);
            setFiles(prev => prev.map((f, idx) =>
              idx >= i && idx < i + BATCH ? { ...f, progress: pct } : f
            ));
          },
        });
        uploadedItems.push(...r.data);
        setFiles(prev => prev.map((f, idx) =>
          idx >= i && idx < i + BATCH ? { ...f, status: 'done' } : f
        ));
      } catch (err) {
        const msg = err.response?.data?.message || 'Upload failed';
        setFiles(prev => prev.map((f, idx) =>
          idx >= i && idx < i + BATCH ? { ...f, status: 'error', error: msg } : f
        ));
        setUploading(false);
        return;
      }
    }

    setStage('done');
    onUploaded(uploadedItems);
    setTimeout(onClose, 800);
    setUploading(false);
  };

  // ── Folder upload ──────────────────────────────────────────────────────────
  const handleFolderUpload = async () => {
    if (!files.length) return;
    setUploading(true);
    setStageError('');

    try {
      // 1. Collect all unique folder paths (e.g. "MyFolder", "MyFolder/Sub")
      const folderPathsSet = new Set();
      files.forEach(({ file }) => {
        const parts = file.webkitRelativePath.split('/');
        for (let i = 1; i < parts.length; i++) {
          folderPathsSet.add(parts.slice(0, i).join('/'));
        }
      });

      const sortedFolderPaths = Array.from(folderPathsSet).sort(
        (a, b) => a.split('/').length - b.split('/').length
      );

      // 2. Create folders shallowest-first
      setStage('creating_folders');
      const pathToId = {};

      for (let i = 0; i < sortedFolderPaths.length; i++) {
        setStageProgress({ current: i + 1, total: sortedFolderPaths.length });
        const folderPath = sortedFolderPaths[i];
        const parts = folderPath.split('/');
        const name = parts[parts.length - 1];
        const parentPath = parts.slice(0, -1).join('/');
        const parent = parentPath ? pathToId[parentPath] : (currentFolder || null);

        const r = await api.post('/files/folder', { name, parent });
        pathToId[folderPath] = r.data._id;
      }

      // 3. Group files by their parent folder path
      const filesByParent = {};
      files.forEach(({ file }) => {
        const parts = file.webkitRelativePath.split('/');
        const parentPath = parts.slice(0, -1).join('/');
        if (!filesByParent[parentPath]) filesByParent[parentPath] = [];
        filesByParent[parentPath].push(file);
      });

      // 4. Upload files group by group, batch by batch
      setStage('uploading');
      let uploaded = 0;
      const total = files.length;

      for (const [parentPath, groupFiles] of Object.entries(filesByParent)) {
        const parentId = pathToId[parentPath] || currentFolder || null;

        for (let i = 0; i < groupFiles.length; i += BATCH) {
          const slice = groupFiles.slice(i, i + BATCH);
          setStageProgress({ current: uploaded, total });

          const formData = new FormData();
          slice.forEach(f => formData.append('files', f));
          if (parentId) formData.append('parent', parentId);

          await api.post('/files/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
          uploaded += slice.length;
          setStageProgress({ current: uploaded, total });
        }
      }

      // 5. Add the top-level folder to the view
      setStage('done');
      const topPath = sortedFolderPaths[0];
      if (topPath && pathToId[topPath]) {
        const r = await api.get(`/files/${pathToId[topPath]}`);
        onUploaded([r.data]);
      }
      setTimeout(onClose, 900);
    } catch (err) {
      setStageError(err.response?.data?.message || 'Upload failed');
      setStage(null);
    } finally {
      setUploading(false);
    }
  };

  const handleUpload = isFolderMode ? handleFolderUpload : handleFileUpload;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">
            {isFolderMode ? 'Upload Folder' : 'Upload Files'}
          </h2>
          <button
            onClick={onClose}
            disabled={uploading}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {isFolderMode ? (
            /* ── Folder mode ─────────────────────────────────────────────── */
            <div className="space-y-4">
              {/* Folder summary card */}
              <div className="flex items-center gap-4 p-4 bg-blue-50 rounded-xl border border-blue-100">
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Folder className="w-6 h-6 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{folderName}</p>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {files.length} file{files.length !== 1 ? 's' : ''}
                    {subfolderCount > 0 && ` · ${subfolderCount} subfolder${subfolderCount !== 1 ? 's' : ''}`}
                    {' · '}{formatBytes(totalSize)}
                  </p>
                </div>
              </div>

              {/* Stage progress */}
              {stage && stage !== 'done' && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">
                      {stage === 'creating_folders' ? 'Creating folder structure…' : 'Uploading files…'}
                    </span>
                    <span className="text-gray-400 text-xs tabular-nums">
                      {stageProgress.current}/{stageProgress.total}
                    </span>
                  </div>
                  <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all duration-200"
                      style={{
                        width: stageProgress.total
                          ? `${(stageProgress.current / stageProgress.total) * 100}%`
                          : '0%',
                      }}
                    />
                  </div>
                </div>
              )}

              {stage === 'done' && (
                <div className="flex items-center gap-2 text-green-600 text-sm font-medium">
                  <CheckCircle className="w-4 h-4" />
                  Folder uploaded successfully
                </div>
              )}

              {stageError && (
                <div className="flex items-center gap-2 text-red-600 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {stageError}
                </div>
              )}
            </div>
          ) : (
            /* ── File mode ───────────────────────────────────────────────── */
            <>
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                  isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
                }`}
              >
                <input {...getInputProps()} />
                <Upload className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-sm font-medium text-gray-700">
                  {isDragActive ? 'Drop files here…' : 'Drag & drop files, or click to select'}
                </p>
                <p className="text-xs text-gray-400 mt-1">Any file type · up to 5 GB each</p>
              </div>

              {files.length > 0 && (
                <div className="mt-4 space-y-2 max-h-52 overflow-y-auto">
                  {files.map((f, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{f.file.name}</p>
                        <p className="text-xs text-gray-400">{formatBytes(f.file.size)}</p>
                        {f.status === 'uploading' && (
                          <div className="mt-1.5 h-1 bg-gray-200 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${f.progress}%` }} />
                          </div>
                        )}
                        {f.status === 'error' && <p className="text-xs text-red-500 mt-0.5">{f.error}</p>}
                      </div>
                      {f.status === 'done' && <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />}
                      {f.status === 'error' && <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />}
                      {f.status === 'pending' && (
                        <button onClick={() => removeFile(i)} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 pb-6">
          <button
            onClick={onClose}
            disabled={uploading}
            className="flex-1 py-2.5 border border-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={!files.length || uploading || stage === 'done'}
            className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {uploading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : isFolderMode ? (
              <Folder className="w-4 h-4" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            {uploading
              ? stage === 'creating_folders' ? 'Creating folders…' : 'Uploading…'
              : isFolderMode
              ? 'Upload folder'
              : `Upload ${files.length > 1 ? `${files.length} files` : 'file'}`}
          </button>
        </div>
      </div>
    </div>
  );
}
