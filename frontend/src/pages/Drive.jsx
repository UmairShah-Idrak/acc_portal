import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  LayoutGrid, List, Upload, FolderPlus, ChevronRight,
  Star, Clock, Trash2, RefreshCw, HardDrive, Share2
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { formatDistanceToNow } from 'date-fns';
import api from '../api/axios';
import toast from 'react-hot-toast';
import FileIcon from '../components/Files/FileIcon';
import ContextMenu from '../components/Files/ContextMenu';
import UploadModal from '../components/Files/UploadModal';
import CreateFolderModal from '../components/Files/CreateFolderModal';
import ShareModal from '../components/Files/ShareModal';
import RenameModal from '../components/Files/RenameModal';
import NewVersionModal from '../components/Files/NewVersionModal';
import PreviewModal from '../components/Files/PreviewModal';
import { useDropzone } from 'react-dropzone';

function formatBytes(b) {
  if (!b) return '0 B';
  const k = 1024, s = ['B','KB','MB','GB','TB'];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return `${(b / Math.pow(k, i)).toFixed(1)} ${s[i]}`;
}

const VIEW_LABELS = {
  starred: { label: 'Starred', icon: Star },
  recent: { label: 'Recent', icon: Clock },
  trash: { label: 'Trash', icon: Trash2 },
  shared: { label: 'Shared with me', icon: Share2 },
};

export default function Drive({ view: viewProp }) {
  const { folderId } = useParams();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';
  const [searchParams] = useSearchParams();
  const searchQuery = searchParams.get('search');

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('grid'); // grid | list
  const [breadcrumbs, setBreadcrumbs] = useState([]);
  const [contextMenu, setContextMenu] = useState(null); // { x, y, item }
  const [modal, setModal] = useState(null); // { type, item? }
  const fileInputRef = useRef(null);
  const versionInputRef = useRef(null);
  const [versionTarget, setVersionTarget] = useState(null);

  const currentFolder = folderId || null;
  const view = searchQuery ? 'search' : viewProp;

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      let url = '/files?';
      if (searchQuery) url += `search=${encodeURIComponent(searchQuery)}`;
      else if (view === 'starred') url += 'view=starred';
      else if (view === 'recent') url += 'view=recent';
      else if (view === 'trash') url += 'view=trash';
      else if (currentFolder) url += `parent=${currentFolder}`;

      const r = await api.get(url);
      setItems(r.data);
    } catch {
      toast.error('Failed to load files');
    } finally {
      setLoading(false);
    }
  }, [currentFolder, view, searchQuery]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  // Fetch breadcrumbs when inside a folder
  useEffect(() => {
    if (!currentFolder) { setBreadcrumbs([]); return; }
    api.get(`/files/${currentFolder}/breadcrumb`)
      .then(r => setBreadcrumbs(r.data))
      .catch(() => {});
  }, [currentFolder]);

  // Drag-to-upload on the page
  const onDrop = useCallback(acceptedFiles => {
    if (!acceptedFiles.length || view === 'trash' || view === 'starred' || view === 'recent') return;
    setModal({ type: 'upload', droppedFiles: acceptedFiles });
  }, [view]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    noClick: true,
    noKeyboard: true,
  });

  const handleContextMenu = (e, item) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, item });
  };

  const handleAction = async (action, item) => {
    switch (action) {
      case 'download':
        downloadFile(item);
        break;
      case 'share':
        setModal({ type: 'share', item });
        break;
      case 'rename':
        setModal({ type: 'rename', item });
        break;
      case 'toggleStar':
        try {
          const r = await api.put(`/files/${item._id}`, { isStarred: !item.isStarred });
          setItems(prev => prev.map(i => i._id === item._id ? r.data : i));
          toast.success(r.data.isStarred ? 'Added to starred' : 'Removed from starred');
        } catch { toast.error('Failed'); }
        break;
      case 'trash':
        try {
          await api.delete(`/files/${item._id}`);
          setItems(prev => prev.filter(i => i._id !== item._id));
          toast.success('Moved to trash');
        } catch { toast.error('Failed to move to trash'); }
        break;
      case 'restore':
        try {
          const r = await api.post(`/files/${item._id}/restore`);
          setItems(prev => prev.filter(i => i._id !== item._id));
          toast.success('Restored to My Drive');
        } catch { toast.error('Failed to restore'); }
        break;
      case 'deletePermanent':
        if (!confirm(`Permanently delete "${item.name}"? This cannot be undone.`)) return;
        try {
          await api.delete(`/files/${item._id}?permanent=true`);
          setItems(prev => prev.filter(i => i._id !== item._id));
          toast.success('Deleted permanently');
        } catch { toast.error('Failed to delete'); }
        break;
      case 'newVersion':
        setVersionTarget(item);
        versionInputRef.current?.click();
        break;
      case 'preview':
        setModal({ type: 'preview', item });
        break;
    }
  };

  const downloadFile = item => {
    const a = document.createElement('a');
    a.href = `/api/files/${item._id}/download`;
    a.download = item.name;
    a.click();
  };

  const handleVersionFileSelect = async e => {
    const file = e.target.files?.[0];
    if (!file || !versionTarget) return;
    e.target.value = '';
    const formData = new FormData();
    formData.append('file', file);
    try {
      const r = await api.post(`/files/${versionTarget._id}/version`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setItems(prev => prev.map(i => i._id === versionTarget._id ? r.data : i));
      toast.success('File updated successfully');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Upload failed');
    }
    setVersionTarget(null);
  };

  const handleItemClick = item => {
    if (item.type === 'folder') {
      navigate(`/folder/${item._id}`);
    }
  };

  const viewTitle = searchQuery
    ? `Search: "${searchQuery}"`
    : view
    ? VIEW_LABELS[view]?.label || 'My Drive'
    : currentFolder
    ? breadcrumbs[breadcrumbs.length - 1]?.name || 'Folder'
    : 'My Drive';

  const ViewIcon = view ? VIEW_LABELS[view]?.icon || HardDrive : HardDrive;

  const canUpload = !view && !searchQuery;

  return (
    <div {...getRootProps()} className="flex flex-col h-full relative" onClick={() => setContextMenu(null)}>
      <input {...getInputProps()} />

      {/* Drag overlay */}
      {isDragActive && canUpload && (
        <div className="absolute inset-0 bg-blue-500/10 border-4 border-blue-500 border-dashed rounded-2xl z-40 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <Upload className="w-16 h-16 text-blue-500 mx-auto mb-2" />
            <p className="text-2xl font-bold text-blue-600">Drop files to upload</p>
          </div>
        </div>
      )}

      {/* Hidden file inputs */}
      <input type="file" multiple ref={fileInputRef} className="hidden" onChange={e => {
        const files = Array.from(e.target.files || []);
        e.target.value = '';
        if (files.length) setModal({ type: 'upload', droppedFiles: files });
      }} />
      <input type="file" ref={versionInputRef} className="hidden" onChange={handleVersionFileSelect} />

      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0 bg-white">
        {/* Breadcrumbs */}
        <div className="flex items-center gap-1 text-sm font-medium text-gray-600 flex-1 min-w-0">
          {!view && !searchQuery ? (
            <>
              <button onClick={() => navigate('/')} className="flex items-center gap-1.5 hover:text-gray-900 transition-colors">
                <HardDrive className="w-4 h-4" />
                <span>My Drive</span>
              </button>
              {breadcrumbs.map(bc => (
                <span key={bc._id} className="flex items-center gap-1">
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                  <button onClick={() => navigate(`/folder/${bc._id}`)} className="hover:text-gray-900 transition-colors truncate max-w-[120px]">
                    {bc.name}
                  </button>
                </span>
              ))}
              {currentFolder && (
                <span className="flex items-center gap-1 text-gray-900">
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                  <span className="truncate max-w-[160px]">{items.length > 0 ? '' : ''}</span>
                </span>
              )}
            </>
          ) : (
            <div className="flex items-center gap-2">
              <ViewIcon className="w-4 h-4" />
              <span className="text-gray-900 font-semibold">{viewTitle}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {canUpload && (
            <>
              <button onClick={() => setModal({ type: 'createFolder' })} className="btn-ghost">
                <FolderPlus className="w-4 h-4" />
                <span className="hidden sm:inline">New Folder</span>
              </button>
              <button onClick={() => fileInputRef.current?.click()} className="btn-primary">
                <Upload className="w-4 h-4" />
                <span className="hidden sm:inline">Upload</span>
              </button>
            </>
          )}
          <button
            onClick={() => setViewMode(v => v === 'grid' ? 'list' : 'grid')}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
            title={viewMode === 'grid' ? 'List view' : 'Grid view'}
          >
            {viewMode === 'grid' ? <List className="w-4 h-4" /> : <LayoutGrid className="w-4 h-4" />}
          </button>
          <button onClick={fetchItems} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors" title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState view={view} searchQuery={searchQuery} canUpload={canUpload} onUpload={() => fileInputRef.current?.click()} />
        ) : viewMode === 'grid' ? (
          <GridView items={items} onContextMenu={handleContextMenu} onClick={handleItemClick} onAction={handleAction} isAdmin={isAdmin} />
        ) : (
          <ListView items={items} onContextMenu={handleContextMenu} onClick={handleItemClick} onAction={handleAction} downloadFile={downloadFile} isAdmin={isAdmin} />
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          item={contextMenu.item}
          onClose={() => setContextMenu(null)}
          onAction={action => handleAction(action, contextMenu.item)}
        />
      )}

      {/* Modals */}
      {modal?.type === 'upload' && (
        <UploadModal
          currentFolder={currentFolder}
          initialFiles={modal.droppedFiles}
          onClose={() => setModal(null)}
          onUploaded={newItems => setItems(prev => [...prev, ...newItems])}
        />
      )}
      {modal?.type === 'createFolder' && (
        <CreateFolderModal
          currentFolder={currentFolder}
          onClose={() => setModal(null)}
          onCreated={folder => setItems(prev => [folder, ...prev])}
        />
      )}
      {modal?.type === 'share' && (
        <ShareModal file={modal.item} onClose={() => setModal(null)} />
      )}
      {modal?.type === 'rename' && (
        <RenameModal
          item={modal.item}
          onClose={() => setModal(null)}
          onRenamed={updated => setItems(prev => prev.map(i => i._id === updated._id ? updated : i))}
        />
      )}
      {modal?.type === 'preview' && (
        <PreviewModal
          file={modal.item}
          onClose={() => setModal(null)}
          onDownload={() => downloadFile(modal.item)}
        />
      )}
    </div>
  );
}

function GridView({ items, onContextMenu, onClick, onAction, isAdmin }) {
  const folders = items.filter(i => i.type === 'folder');
  const files = items.filter(i => i.type === 'file');

  return (
    <div className="space-y-6">
      {folders.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Folders</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {folders.map(item => (
              <GridCard key={item._id} item={item} onContextMenu={onContextMenu} onClick={onClick} onAction={onAction} isAdmin={isAdmin} />
            ))}
          </div>
        </section>
      )}
      {files.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Files</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {files.map(item => (
              <GridCard key={item._id} item={item} onContextMenu={onContextMenu} onClick={onClick} onAction={onAction} isAdmin={isAdmin} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function GridCard({ item, onContextMenu, onClick, onAction, isAdmin }) {
  const isImage = item.mimeType?.startsWith('image/');

  return (
    <div
      onContextMenu={e => onContextMenu(e, item)}
      onClick={() => onClick(item)}
      className="group relative bg-white border border-gray-200 rounded-2xl overflow-hidden cursor-pointer hover:shadow-md hover:border-blue-200 transition-all select-none"
    >
      {/* Thumbnail / Icon */}
      <div className="aspect-[4/3] flex items-center justify-center bg-gray-50 border-b border-gray-100">
        {isImage ? (
          <img
            src={`/api/files/${item._id}/preview`}
            alt={item.name}
            className="w-full h-full object-cover"
            onError={e => { e.target.style.display = 'none'; }}
          />
        ) : (
          <FileIcon item={item} size="lg" />
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <p className="text-xs font-medium text-gray-800 truncate leading-5">{item.name}</p>
        <div className="flex items-center justify-between mt-0.5">
          {item.type === 'file' && <p className="text-xs text-gray-400">{formatBytes(item.size)}</p>}
          {isAdmin && item.owner && (
            <span className="text-xs text-blue-500 font-medium truncate ml-1" title={item.owner.email}>
              {item.owner.name}
            </span>
          )}
        </div>
      </div>

      {/* Star indicator */}
      {item.isStarred && (
        <div className="absolute top-2 right-2">
          <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
        </div>
      )}

      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors" />
    </div>
  );
}

function ListView({ items, onContextMenu, onClick, onAction, downloadFile, isAdmin }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-full">Name</th>
            {isAdmin && <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell w-32">Owner</th>}
            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell w-32">Size</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell w-40">Modified</th>
            <th className="w-20 px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {items.map(item => (
            <ListRow key={item._id} item={item} onContextMenu={onContextMenu} onClick={onClick} onAction={onAction} downloadFile={downloadFile} isAdmin={isAdmin} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ListRow({ item, onContextMenu, onClick, onAction, downloadFile, isAdmin }) {
  return (
    <tr
      onContextMenu={e => onContextMenu(e, item)}
      onClick={() => onClick(item)}
      className="hover:bg-gray-50 cursor-pointer group transition-colors"
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <FileIcon item={item} size="sm" />
          <span className="text-sm font-medium text-gray-800 truncate max-w-xs">{item.name}</span>
          {item.isStarred && <Star className="w-3 h-3 text-yellow-400 fill-yellow-400 flex-shrink-0" />}
        </div>
      </td>
      {isAdmin && (
        <td className="px-4 py-3 hidden md:table-cell whitespace-nowrap">
          {item.owner && (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-blue-50 text-blue-600 text-xs rounded-full font-medium">
              <div className="w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center text-[9px] font-bold">
                {item.owner.name?.[0]?.toUpperCase()}
              </div>
              {item.owner.name}
            </span>
          )}
        </td>
      )}
      <td className="px-4 py-3 text-xs text-gray-400 hidden md:table-cell whitespace-nowrap">
        {item.type === 'file' ? formatBytes(item.size) : '—'}
      </td>
      <td className="px-4 py-3 text-xs text-gray-400 hidden lg:table-cell whitespace-nowrap">
        {formatDistanceToNow(new Date(item.updatedAt), { addSuffix: true })}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
          {item.type === 'file' && !item.isTrashed && (
            <button
              onClick={e => { e.stopPropagation(); downloadFile(item); }}
              className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-500"
              title="Download"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </button>
          )}
          <button
            onClick={e => { e.stopPropagation(); onContextMenu({ preventDefault: () => {}, stopPropagation: () => {}, clientX: e.clientX, clientY: e.clientY }, item); }}
            className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-500"
            title="More options"
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" />
            </svg>
          </button>
        </div>
      </td>
    </tr>
  );
}

function EmptyState({ view, searchQuery, canUpload, onUpload }) {
  if (searchQuery) return (
    <div className="flex flex-col items-center justify-center h-64 text-center">
      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
        <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>
      <p className="text-gray-600 font-medium">No results found</p>
      <p className="text-gray-400 text-sm mt-1">Try a different search term</p>
    </div>
  );

  if (view === 'trash') return (
    <div className="flex flex-col items-center justify-center h-64 text-center">
      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
        <Trash2 className="w-8 h-8 text-gray-400" />
      </div>
      <p className="text-gray-600 font-medium">Trash is empty</p>
      <p className="text-gray-400 text-sm mt-1">Deleted items will appear here</p>
    </div>
  );

  if (view === 'starred') return (
    <div className="flex flex-col items-center justify-center h-64 text-center">
      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
        <Star className="w-8 h-8 text-gray-400" />
      </div>
      <p className="text-gray-600 font-medium">No starred items</p>
      <p className="text-gray-400 text-sm mt-1">Right-click any file to star it</p>
    </div>
  );

  if (view === 'shared') return (
    <div className="flex flex-col items-center justify-center h-64 text-center">
      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
        <Share2 className="w-8 h-8 text-gray-400" />
      </div>
      <p className="text-gray-600 font-medium">No files shared with you</p>
      <p className="text-gray-400 text-sm mt-1">Files shared with you by others will appear here</p>
    </div>
  );

  return (
    <div className="flex flex-col items-center justify-center h-64 text-center">
      <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-4">
        <Upload className="w-8 h-8 text-blue-400" />
      </div>
      <p className="text-gray-600 font-medium">No files here yet</p>
      <p className="text-gray-400 text-sm mt-1">Drag & drop files, or click to upload</p>
      {canUpload && (
        <button onClick={onUpload} className="mt-4 btn-primary">
          <Upload className="w-4 h-4" />
          Upload files
        </button>
      )}
    </div>
  );
}
