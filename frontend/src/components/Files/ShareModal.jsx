import { useState, useEffect } from 'react';
import { Share2, X, Copy, Check, Trash2, Lock, Eye, EyeOff, Link } from 'lucide-react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { formatDistanceToNow } from 'date-fns';

function formatBytes(b) {
  if (!b) return '0 B';
  const k = 1024, s = ['B','KB','MB','GB'];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return `${(b / Math.pow(k, i)).toFixed(1)} ${s[i]}`;
}

export default function ShareModal({ file, onClose }) {
  const [shares, setShares] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ password: '', expiresIn: '', label: '' });
  const [showPass, setShowPass] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  useEffect(() => {
    fetchShares();
  }, []);

  const fetchShares = async () => {
    try {
      const r = await api.get(`/shares/file/${file._id}`);
      setShares(r.data);
    } catch (err) {
      toast.error('Failed to load shares');
    } finally {
      setLoading(false);
    }
  };

  const createShare = async e => {
    e.preventDefault();
    if (!form.password) { toast.error('Password is required'); return; }
    setCreating(true);
    try {
      const r = await api.post('/shares', {
        fileId: file._id,
        password: form.password,
        expiresIn: form.expiresIn || undefined,
        label: form.label,
      });
      setShares(prev => [r.data, ...prev]);
      setForm({ password: '', expiresIn: '', label: '' });
      toast.success('Share link created');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create share');
    } finally {
      setCreating(false);
    }
  };

  const revokeShare = async id => {
    try {
      await api.delete(`/shares/${id}`);
      setShares(prev => prev.filter(s => s._id !== id));
      toast.success('Share revoked');
    } catch {
      toast.error('Failed to revoke');
    }
  };

  const copyLink = (token, id) => {
    const url = `${window.location.origin}/share/${token}`;
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    toast.success('Link copied to clipboard');
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
              <Share2 className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Share "{file.name}"</h2>
              <p className="text-xs text-gray-400">{formatBytes(file.size)}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100"><X className="w-5 h-5" /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-6">
          {/* Create share form */}
          <div>
            <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <Link className="w-4 h-4 text-blue-500" />
              Create Password-Protected Link
            </h3>
            <form onSubmit={createShare} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Label (optional)</label>
                <input
                  value={form.label}
                  onChange={e => setForm(p => ({ ...p, label: e.target.value }))}
                  placeholder="e.g. For client review"
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Password *</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-3.5 h-3.5" />
                    <input
                      type={showPass ? 'text' : 'password'}
                      value={form.password}
                      onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                      required
                      placeholder="Min 4 chars"
                      className="w-full pl-9 pr-8 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button type="button" onClick={() => setShowPass(p => !p)} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400">
                      {showPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Expires in</label>
                  <select
                    value={form.expiresIn}
                    onChange={e => setForm(p => ({ ...p, expiresIn: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="">Never</option>
                    <option value="1">1 day</option>
                    <option value="7">7 days</option>
                    <option value="30">30 days</option>
                    <option value="90">90 days</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={creating}
                className="w-full py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {creating ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Share2 className="w-4 h-4" />}
                Generate Link
              </button>
            </form>
          </div>

          {/* Existing shares */}
          {!loading && shares.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-800 mb-3">Active Share Links</h3>
              <div className="space-y-2">
                {shares.map(share => (
                  <div key={share._id} className="p-3 bg-gray-50 rounded-xl border border-gray-200">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        {share.label && <p className="text-sm font-medium text-gray-800 truncate">{share.label}</p>}
                        <p className="text-xs text-gray-500 font-mono truncate mt-0.5">
                          {window.location.origin}/share/{share.token}
                        </p>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-xs text-gray-400">
                            {share.expiresAt
                              ? `Expires ${formatDistanceToNow(new Date(share.expiresAt), { addSuffix: true })}`
                              : 'Never expires'}
                          </span>
                          <span className="text-xs text-gray-400">{share.downloadCount} downloads</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => copyLink(share.token, share._id)}
                          className="p-1.5 rounded-lg hover:bg-white hover:shadow-sm transition-all text-gray-500 hover:text-blue-600"
                          title="Copy link"
                        >
                          {copiedId === share._id ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => revokeShare(share._id)}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                          title="Revoke"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {loading && (
            <div className="flex justify-center py-4">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
