import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, X, CloudUpload } from 'lucide-react';
import api from '../../api/axios';
import toast from 'react-hot-toast';

export default function NewVersionModal({ file, onClose, onUpdated }) {
  const [newFile, setNewFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  const onDrop = useCallback(([f]) => { if (f) setNewFile(f); }, []);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, multiple: false });

  const handleUpload = async () => {
    if (!newFile) return;
    setUploading(true);
    const formData = new FormData();
    formData.append('file', newFile);
    try {
      const r = await api.post(`/files/${file._id}/version`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('File updated successfully');
      onUpdated(r.data);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-900">Upload New Version</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <p className="text-sm text-gray-500 mb-4">Replacing: <span className="font-medium text-gray-700">{file.name}</span></p>

        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
            isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400'
          }`}
        >
          <input {...getInputProps()} />
          <CloudUpload className="w-10 h-10 text-gray-300 mx-auto mb-2" />
          {newFile ? (
            <p className="text-sm font-medium text-blue-600">{newFile.name}</p>
          ) : (
            <p className="text-sm text-gray-500">Drop new file here or click to select</p>
          )}
        </div>

        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50">Cancel</button>
          <button
            onClick={handleUpload}
            disabled={!newFile || uploading}
            className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {uploading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? 'Uploading...' : 'Replace File'}
          </button>
        </div>
      </div>
    </div>
  );
}
