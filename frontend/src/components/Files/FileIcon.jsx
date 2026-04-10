import { Folder, FileText, FileImage, FileVideo, FileAudio, FileArchive, FileCode, File, FileSpreadsheet } from 'lucide-react';

const mimeMap = {
  'application/pdf': { icon: FileText, color: 'text-red-500', bg: 'bg-red-50' },
  'application/msword': { icon: FileText, color: 'text-blue-500', bg: 'bg-blue-50' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { icon: FileText, color: 'text-blue-500', bg: 'bg-blue-50' },
  'application/vnd.ms-excel': { icon: FileSpreadsheet, color: 'text-green-600', bg: 'bg-green-50' },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { icon: FileSpreadsheet, color: 'text-green-600', bg: 'bg-green-50' },
  'application/vnd.ms-powerpoint': { icon: FileText, color: 'text-orange-500', bg: 'bg-orange-50' },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': { icon: FileText, color: 'text-orange-500', bg: 'bg-orange-50' },
  'application/zip': { icon: FileArchive, color: 'text-yellow-600', bg: 'bg-yellow-50' },
  'application/x-rar-compressed': { icon: FileArchive, color: 'text-yellow-600', bg: 'bg-yellow-50' },
  'text/plain': { icon: FileText, color: 'text-gray-600', bg: 'bg-gray-50' },
  'text/csv': { icon: FileSpreadsheet, color: 'text-green-600', bg: 'bg-green-50' },
};

export function getFileStyle(mimeType) {
  if (!mimeType) return { icon: File, color: 'text-gray-500', bg: 'bg-gray-50' };
  if (mimeMap[mimeType]) return mimeMap[mimeType];
  if (mimeType.startsWith('image/')) return { icon: FileImage, color: 'text-pink-500', bg: 'bg-pink-50' };
  if (mimeType.startsWith('video/')) return { icon: FileVideo, color: 'text-purple-500', bg: 'bg-purple-50' };
  if (mimeType.startsWith('audio/')) return { icon: FileAudio, color: 'text-indigo-500', bg: 'bg-indigo-50' };
  if (mimeType.startsWith('text/') || mimeType.includes('javascript') || mimeType.includes('json')) return { icon: FileCode, color: 'text-gray-600', bg: 'bg-gray-50' };
  return { icon: File, color: 'text-gray-500', bg: 'bg-gray-50' };
}

export default function FileIcon({ item, size = 'md' }) {
  const sz = size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-8 h-8' : 'w-5 h-5';
  const boxSz = size === 'sm' ? 'w-8 h-8' : size === 'lg' ? 'w-14 h-14' : 'w-10 h-10';

  if (item.type === 'folder') {
    return (
      <div className={`${boxSz} rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0`}>
        <Folder className={`${sz} text-amber-500 fill-amber-400`} />
      </div>
    );
  }

  const { icon: Icon, color, bg } = getFileStyle(item.mimeType);
  return (
    <div className={`${boxSz} rounded-xl ${bg} flex items-center justify-center flex-shrink-0`}>
      <Icon className={`${sz} ${color}`} />
    </div>
  );
}
