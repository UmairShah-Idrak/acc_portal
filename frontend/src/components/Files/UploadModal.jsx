import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, X, CheckCircle, AlertCircle, CloudUpload } from 'lucide-react';
import api from '../../api/axios';

function formatBytes(b) {
  if (!b) return '0 B';
  const k = 1024, s = ['B','KB','MB','GB'];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return `${(b / Math.pow(k, i)).toFixed(1)} ${s[i]}`;
}

export default function UploadModal({ currentFolder, onClose, onUploaded, initialFiles = [] }) {
  const [files, setFiles] = useState(
    initialFiles.map(f => ({ file: f, status: 'pending', progress: 0, error: null }))
  );
  const [uploading, setUploading] = useState(false);

  const onDrop = useCallback(accepted => {
    setFiles(prev => [
      ...prev,
      ...accepted.map(f => ({ file: f, status: 'pending', progress: 0, error: null }))
    ]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, multiple: true });

  const removeFile = idx => setFiles(prev => prev.filter((_, i) => i !== idx));

  const handleUpload = async () => {
    if (!files.length) return;
    setUploading(true);
    const formData = new FormData();
    files.forEach(f => formData.append('files', f.file));
    if (currentFolder) formData.append('parent', currentFolder);

    try {
      setFiles(prev => prev.map(f => ({ ...f, status: 'uploading' })));
      const r = await api.post('/files/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: e => {
          const pct = Math.round((e.loaded / e.total) * 100);
          setFiles(prev => prev.map(f => ({ ...f, progress: pct })));
        },
      });
      setFiles(prev => prev.map(f => ({ ...f, status: 'done' })));
      onUploaded(r.data);
      setTimeout(onClose, 800);
    } catch (err) {
      setFiles(prev => prev.map(f => ({ ...f, status: 'error', error: err.response?.data?.message || 'Upload failed' })));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Upload Files</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6">
          {/* Drop zone */}
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
              isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
            }`}
          >
            <input {...getInputProps()} />
            <CloudUpload className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-700">
              {isDragActive ? 'Drop files here...' : 'Drag & drop files, or click to select'}
            </p>
            <p className="text-xs text-gray-400 mt-1">Any file type, up to 5 GB each</p>
          </div>

          {/* File list */}
          {files.length > 0 && (
            <div className="mt-4 space-y-2 max-h-48 overflow-y-auto">
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
        </div>

        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50">Cancel</button>
          <button
            onClick={handleUpload}
            disabled={!files.length || uploading}
            className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {uploading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? 'Uploading...' : `Upload ${files.length > 1 ? `${files.length} files` : 'file'}`}
          </button>
        </div>
      </div>
    </div>
  );
}
