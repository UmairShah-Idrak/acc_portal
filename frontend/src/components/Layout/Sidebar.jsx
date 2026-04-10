import { NavLink, useNavigate } from 'react-router-dom';
import { HardDrive, Star, Clock, Trash2, Users, ChevronRight, FolderOpen } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export default function Sidebar() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const navItems = [
    { to: '/', label: 'My Drive', icon: HardDrive, end: true },
    { to: '/recent', label: 'Recent', icon: Clock },
    { to: '/starred', label: 'Starred', icon: Star },
    { to: '/trash', label: 'Trash', icon: Trash2 },
  ];

  return (
    <aside className="w-64 flex-shrink-0 border-r border-gray-200 flex flex-col bg-white">
      {/* Logo */}
      <div className="h-16 flex items-center px-5 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <FolderOpen className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold text-gray-900 text-sm">Accounts Portal</span>
        </div>
      </div>

      {/* New button */}
      <div className="px-4 py-4">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-300 rounded-2xl text-sm font-medium text-gray-700 hover:bg-gray-50 hover:shadow-md transition-all w-full"
        >
          <span className="text-xl leading-none font-light text-gray-500">+</span>
          New
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 space-y-0.5">
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-full text-sm font-medium transition-colors ${
                isActive ? 'bg-blue-100 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
              }`
            }
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            {label}
          </NavLink>
        ))}

        {user?.role === 'admin' && (
          <>
            <div className="pt-3 pb-1 px-3">
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Admin</span>
            </div>
            <NavLink
              to="/users"
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-full text-sm font-medium transition-colors ${
                  isActive ? 'bg-blue-100 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
                }`
              }
            >
              <Users className="w-4 h-4 flex-shrink-0" />
              User Management
            </NavLink>
          </>
        )}
      </nav>

      {/* Storage indicator */}
      <div className="p-4 border-t border-gray-100">
        <div className="text-xs text-gray-500 mb-2 flex justify-between">
          <span>Storage used</span>
          <span className="font-medium text-gray-700">{formatBytes(user?.storageUsed)}</span>
        </div>
        <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all"
            style={{ width: `${Math.min(((user?.storageUsed || 0) / (100 * 1024 * 1024 * 1024)) * 100, 100)}%` }}
          />
        </div>
        <p className="text-xs text-gray-400 mt-1">{formatBytes(user?.storageUsed)} of unlimited</p>
      </div>
    </aside>
  );
}
