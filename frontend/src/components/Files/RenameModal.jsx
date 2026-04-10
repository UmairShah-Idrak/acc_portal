import { useState } from 'react';
import { Pencil, X } from 'lucide-react';
import api from '../../api/axios';
import toast from 'react-hot-toast';

export default function RenameModal({ item, onClose, onRenamed }) {
  const [name, setName] = useState(item.name);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async e => {
    e.preventDefault();
    if (!name.trim() || name.trim() === item.name) { onClose(); return; }
    setLoading(true);
    try {
      const r = await api.put(`/files/${item._id}`, { name: name.trim() });
      onRenamed(r.data);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to rename');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
            <Pencil className="w-5 h-5 text-blue-500" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900">Rename</h2>
        </div>
        <form onSubmit={handleSubmit}>
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
          />
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={!name.trim() || loading} className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
              Rename
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
