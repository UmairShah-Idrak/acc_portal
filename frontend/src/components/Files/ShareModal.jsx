import { useState, useEffect, useRef } from 'react';
import { Share2, X, Copy, Check, Trash2, Lock, Eye, EyeOff, Link, UserPlus, Users } from 'lucide-react';
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
  const isFolder = file.type === 'folder';
  const [tab, setTab] = useState('users'); // 'users' | 'links'
  const [shares, setShares] = useState([]);
  const [sharedUsers, setSharedUsers] = useState([]);
  const [allUsers, setAllUsers] = useState([]); // for autocomplete
  const [loadingShares, setLoadingShares] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [creating, setCreating] = useState(false);
  const [addingUser, setAddingUser] = useState(false);
  const [linkForm, setLinkForm] = useState({ password: '', expiresIn: '', label: '' });
  const [userEmail, setUserEmail] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const inputRef = useRef(null);
  const suggestionsRef = useRef(null);

  useEffect(() => {
    fetchShares();
    fetchSharedUsers();
    fetchAllUsers();
  }, []);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handler = e => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target) &&
          inputRef.current && !inputRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fetchShares = async () => {
    try {
      const r = await api.get(`/shares/file/${file._id}`);
      setShares(r.data);
    } catch { toast.error('Failed to load share links'); }
    finally { setLoadingShares(false); }
  };

  const fetchSharedUsers = async () => {
    try {
      const r = await api.get(`/files/${file._id}/shared-users`);
      setSharedUsers(r.data);
    } catch { }
    finally { setLoadingUsers(false); }
  };

  const fetchAllUsers = async () => {
    try {
      const r = await api.get('/users/list');
      setAllUsers(r.data);
    } catch { }
  };

  // ── Autocomplete helpers ──────────────────────────────────────────────────
  const alreadySharedIds = new Set(sharedUsers.map(u => u._id));
  const suggestions = allUsers.filter(u =>
    !alreadySharedIds.has(u._id) &&
    (u.email.toLowerCase().includes(userEmail.toLowerCase()) ||
     u.name.toLowerCase().includes(userEmail.toLowerCase()))
  );

  const selectSuggestion = user => {
    setUserEmail(user.email);
    setShowSuggestions(false);
  };

  // ── Internal user share ───────────────────────────────────────────────────
  const addUser = async e => {
    e.preventDefault();
    if (!userEmail.trim()) return;
    setAddingUser(true);
    try {
      const r = await api.post(`/files/${file._id}/share-user`, { email: userEmail.trim() });
      setSharedUsers(prev => [...prev, r.data.user]);
      setUserEmail('');
      toast.success(r.data.message);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to share');
    } finally {
      setAddingUser(false);
    }
  };

  const removeUser = async userId => {
    try {
      await api.delete(`/files/${file._id}/share-user/${userId}`);
      setSharedUsers(prev => prev.filter(u => u._id !== userId));
      toast.success('Access revoked');
    } catch { toast.error('Failed to revoke'); }
  };

  // ── Password link share ───────────────────────────────────────────────────
  const createLink = async e => {
    e.preventDefault();
    if (!linkForm.password) { toast.error('Password is required'); return; }
    setCreating(true);
    try {
      const r = await api.post('/shares', {
        fileId: file._id,
        password: linkForm.password,
        expiresIn: linkForm.expiresIn || undefined,
        label: linkForm.label,
      });
      setShares(prev => [r.data, ...prev]);
      setLinkForm({ password: '', expiresIn: '', label: '' });
      toast.success('Share link created');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    } finally {
      setCreating(false);
    }
  };

  const revokeLink = async id => {
    try {
      await api.delete(`/shares/${id}`);
      setShares(prev => prev.filter(s => s._id !== id));
      toast.success('Link revoked');
    } catch { toast.error('Failed'); }
  };

  const copyLink = (token, id) => {
    navigator.clipboard.writeText(`${window.location.origin}/share/${token}`);
    setCopiedId(id);
    toast.success('Link copied');
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
              <h2 className="text-sm font-semibold text-gray-900 truncate max-w-[280px]">Share "{file.name}"</h2>
              <p className="text-xs text-gray-400">
                {isFolder ? 'Folder' : formatBytes(file.size)}
                {isFolder && ' · Shared users can access all files inside'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100"><X className="w-5 h-5" /></button>
        </div>

        {/* Tabs — Password Link only for files */}
        <div className="flex border-b border-gray-100 px-6 flex-shrink-0">
          <button
            onClick={() => setTab('users')}
            className={`flex items-center gap-2 py-3 px-1 mr-6 text-sm font-medium border-b-2 transition-colors ${
              tab === 'users' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Users className="w-4 h-4" />
            {isFolder ? 'Share Folder' : 'Share with User'}
            {sharedUsers.length > 0 && (
              <span className="bg-blue-100 text-blue-700 text-xs px-1.5 py-0.5 rounded-full">{sharedUsers.length}</span>
            )}
          </button>
          {!isFolder && (
            <button
              onClick={() => setTab('links')}
              className={`flex items-center gap-2 py-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                tab === 'links' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Link className="w-4 h-4" />
              Password Link
              {shares.length > 0 && (
                <span className="bg-blue-100 text-blue-700 text-xs px-1.5 py-0.5 rounded-full">{shares.length}</span>
              )}
            </button>
          )}
        </div>

        <div className="overflow-y-auto flex-1 p-6">

          {/* ── Tab: Share with registered user ── */}
          {tab === 'users' && (
            <div className="space-y-4">
              <p className="text-xs text-gray-500">
                {isFolder
                  ? <>Share this folder with a registered user. They will see it in <strong>Shared with me</strong> and can browse all files inside it.</>
                  : <>Share directly with a registered portal user. They will see this file in their <strong>Shared with me</strong> section.</>
                }
              </p>

              <form onSubmit={addUser} className="flex gap-2">
                <div className="flex-1 relative">
                  <input
                    ref={inputRef}
                    type="text"
                    value={userEmail}
                    onChange={e => { setUserEmail(e.target.value); setShowSuggestions(true); }}
                    onFocus={() => setShowSuggestions(true)}
                    placeholder="Search by name or email..."
                    autoComplete="off"
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />

                  {/* Suggestions dropdown */}
                  {showSuggestions && suggestions.length > 0 && (
                    <div
                      ref={suggestionsRef}
                      className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden max-h-48 overflow-y-auto"
                    >
                      {suggestions.map(u => (
                        <button
                          key={u._id}
                          type="button"
                          onMouseDown={() => selectSuggestion(u)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-blue-50 transition-colors text-left"
                        >
                          <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                            {u.name[0].toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">{u.name}</p>
                            <p className="text-xs text-gray-400 truncate">{u.email}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* No matches hint */}
                  {showSuggestions && userEmail.length > 0 && suggestions.length === 0 && allUsers.length > 0 && (
                    <div ref={suggestionsRef} className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl px-3 py-3 text-xs text-gray-400 text-center">
                      No matching users found
                    </div>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={!userEmail.trim() || addingUser}
                  className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5 whitespace-nowrap"
                >
                  {addingUser ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <UserPlus className="w-4 h-4" />}
                  Add
                </button>
              </form>

              {!loadingUsers && sharedUsers.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Has access</p>
                  {sharedUsers.map(u => (
                    <div key={u._id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-semibold">
                          {u.name[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-800">{u.name}</p>
                          <p className="text-xs text-gray-400">{u.email}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => removeUser(u._id)}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="Revoke access"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {!loadingUsers && sharedUsers.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">No users have access yet</p>
              )}
            </div>
          )}

          {/* ── Tab: Password-protected link ── */}
          {tab === 'links' && (
            <div className="space-y-5">
              <form onSubmit={createLink} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Label (optional)</label>
                  <input
                    value={linkForm.label}
                    onChange={e => setLinkForm(p => ({ ...p, label: e.target.value }))}
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
                        value={linkForm.password}
                        onChange={e => setLinkForm(p => ({ ...p, password: e.target.value }))}
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
                      value={linkForm.expiresIn}
                      onChange={e => setLinkForm(p => ({ ...p, expiresIn: e.target.value }))}
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
                  {creating ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Link className="w-4 h-4" />}
                  Generate Link
                </button>
              </form>

              {!loadingShares && shares.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Active Links</p>
                  {shares.map(share => (
                    <div key={share._id} className="p-3 bg-gray-50 rounded-xl border border-gray-200">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          {share.label && <p className="text-sm font-medium text-gray-800">{share.label}</p>}
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
                        <div className="flex items-center gap-1">
                          <button onClick={() => copyLink(share.token, share._id)} className="p-1.5 rounded-lg hover:bg-white text-gray-500 hover:text-blue-600 transition-all" title="Copy">
                            {copiedId === share._id ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                          </button>
                          <button onClick={() => revokeLink(share._id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors" title="Revoke">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
