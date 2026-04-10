import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Lock, Download, Eye, EyeOff, FileText, AlertTriangle, CheckCircle, Timer } from 'lucide-react';
import api from '../api/axios';
import toast from 'react-hot-toast';
import FileIcon from '../components/Files/FileIcon';

function formatBytes(b) {
  if (!b) return '0 B';
  const k = 1024, s = ['B','KB','MB','GB'];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return `${(b / Math.pow(k, i)).toFixed(1)} ${s[i]}`;
}

export default function SharedFile() {
  const { token } = useParams();
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fileInfo, setFileInfo] = useState(null);
  const [downloadToken, setDownloadToken] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [status, setStatus] = useState('form'); // 'form' | 'ready' | 'expired' | 'notfound'

  const handleVerify = async e => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const r = await api.post(`/shares/public/${token}/verify`, { password });
      setFileInfo(r.data.file);
      setDownloadToken(r.data.downloadToken);
      setStatus('ready');
    } catch (err) {
      const msg = err.response?.data?.message || 'Verification failed';
      if (err.response?.status === 404) setStatus('notfound');
      else if (err.response?.status === 410) setStatus('expired');
      else if (err.response?.status === 401) setError('Incorrect password. Try again.');
      else setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!downloadToken) return;
    setDownloading(true);
    try {
      const url = `/api/shares/public/${token}/download?downloadToken=${encodeURIComponent(downloadToken)}`;
      const a = document.createElement('a');
      a.href = url;
      a.download = fileInfo.name;
      a.click();
    } catch {
      toast.error('Download failed');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-600 rounded-2xl mb-3 shadow-lg">
            <svg viewBox="0 0 24 24" className="w-7 h-7 text-white fill-current">
              <path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2z"/>
            </svg>
          </div>
          <p className="text-gray-500 text-sm">Accounts Portal · Secure Share</p>
        </div>

        {/* Not found */}
        {status === 'notfound' && (
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8 text-center">
            <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-7 h-7 text-red-500" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Link Not Found</h2>
            <p className="text-sm text-gray-500">This share link doesn't exist or has been revoked.</p>
          </div>
        )}

        {/* Expired */}
        {status === 'expired' && (
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8 text-center">
            <div className="w-14 h-14 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Timer className="w-7 h-7 text-orange-500" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Link Expired</h2>
            <p className="text-sm text-gray-500">This share link has expired. Contact the sender for a new link.</p>
          </div>
        )}

        {/* Password form */}
        {status === 'form' && (
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
            <div className="text-center mb-6">
              <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <Lock className="w-7 h-7 text-blue-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">Password Protected</h2>
              <p className="text-sm text-gray-500 mt-1">Enter the password to access this file</p>
            </div>

            <form onSubmit={handleVerify} className="space-y-4">
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError(''); }}
                  required
                  autoFocus
                  placeholder="Enter password"
                  className={`w-full pl-10 pr-10 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 transition ${
                    error ? 'border-red-400 focus:ring-red-300' : 'border-gray-300 focus:ring-blue-500'
                  }`}
                />
                <button type="button" onClick={() => setShowPass(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {error && (
                <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 px-3 py-2.5 rounded-xl">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {loading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Lock className="w-4 h-4" />}
                {loading ? 'Verifying...' : 'Access File'}
              </button>
            </form>
          </div>
        )}

        {/* File ready to download */}
        {status === 'ready' && fileInfo && (
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
            <div className="flex items-center gap-2 text-green-600 text-sm bg-green-50 px-3 py-2.5 rounded-xl mb-6">
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
              Access granted
            </div>

            <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl mb-6">
              <FileIcon item={fileInfo} size="lg" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 truncate text-sm">{fileInfo.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">{formatBytes(fileInfo.size)}</p>
              </div>
            </div>

            <button
              onClick={handleDownload}
              disabled={downloading}
              className="w-full py-3.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {downloading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Download className="w-5 h-5" />
              )}
              {downloading ? 'Starting download...' : 'Download File'}
            </button>

            <p className="text-center text-xs text-gray-400 mt-4">
              Download link valid for 10 minutes · Enter password again to refresh
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
