import { useEffect, useRef } from 'react';
import {
  Download, Share2, Star, StarOff, Pencil, Trash2, RotateCcw,
  Trash, Upload, Eye
} from 'lucide-react';

export default function ContextMenu({ x, y, item, onClose, onAction }) {
  const ref = useRef(null);

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', handler);
    document.addEventListener('contextmenu', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('contextmenu', handler);
    };
  }, [onClose]);

  // adjust position so it doesn't go off screen
  const menuStyle = {
    position: 'fixed',
    top: Math.min(y, window.innerHeight - 300),
    left: Math.min(x, window.innerWidth - 200),
    zIndex: 9999,
  };

  const MenuItem = ({ icon: Icon, label, onClick, danger }) => (
    <button
      onClick={() => { onClick(); onClose(); }}
      className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
        danger ? 'text-red-600 hover:bg-red-50' : 'text-gray-700 hover:bg-gray-100'
      }`}
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      {label}
    </button>
  );

  const Divider = () => <div className="my-1 border-t border-gray-100" />;

  return (
    <div ref={ref} style={menuStyle} className="bg-white rounded-xl shadow-2xl border border-gray-200 py-1 w-52 overflow-hidden">
      {item.isTrashed ? (
        <>
          <MenuItem icon={RotateCcw} label="Restore" onClick={() => onAction('restore')} />
          <MenuItem icon={Trash} label="Delete permanently" onClick={() => onAction('deletePermanent')} danger />
        </>
      ) : (
        <>
          {item.type === 'file' && <MenuItem icon={Eye} label="Preview" onClick={() => onAction('preview')} />}
          {item.type === 'file' && <MenuItem icon={Download} label="Download" onClick={() => onAction('download')} />}
          <MenuItem icon={Share2} label="Share" onClick={() => onAction('share')} />
          {item.type === 'file' && <MenuItem icon={Upload} label="Upload new version" onClick={() => onAction('newVersion')} />}
          <Divider />
          <MenuItem
            icon={item.isStarred ? StarOff : Star}
            label={item.isStarred ? 'Unstar' : 'Add to starred'}
            onClick={() => onAction('toggleStar')}
          />
          <MenuItem icon={Pencil} label="Rename" onClick={() => onAction('rename')} />
          <Divider />
          <MenuItem icon={Trash2} label="Move to trash" onClick={() => onAction('trash')} danger />
        </>
      )}
    </div>
  );
}
