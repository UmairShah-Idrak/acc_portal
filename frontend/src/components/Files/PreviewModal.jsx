import { X, Download, ExternalLink } from 'lucide-react';
import FileIcon from './FileIcon';

export default function PreviewModal({ file, onClose, onDownload }) {
  const isImage = file.mimeType?.startsWith('image/');
  const isPDF = file.mimeType === 'application/pdf';
  const isVideo = file.mimeType?.startsWith('video/');
  const isAudio = file.mimeType?.startsWith('audio/');
  const isText = file.mimeType?.startsWith('text/');

  const src = `/api/files/${file._id}/preview`;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <FileIcon item={file} size="sm" />
            <span className="font-medium text-gray-900 text-sm">{file.name}</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onDownload} className="btn-secondary text-sm py-1.5 px-3">
              <Download className="w-4 h-4" />
              Download
            </button>
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Preview content */}
        <div className="flex-1 overflow-auto flex items-center justify-center p-4 bg-gray-50 rounded-b-2xl">
          {isImage && (
            <img src={src} alt={file.name} className="max-w-full max-h-full object-contain rounded-lg shadow" />
          )}
          {isPDF && (
            <iframe src={src} className="w-full h-full min-h-[500px] rounded-lg" title={file.name} />
          )}
          {isVideo && (
            <video controls className="max-w-full max-h-full rounded-lg shadow">
              <source src={src} type={file.mimeType} />
            </video>
          )}
          {isAudio && (
            <div className="text-center">
              <FileIcon item={file} size="lg" />
              <p className="mt-4 text-sm text-gray-600 font-medium">{file.name}</p>
              <audio controls className="mt-4">
                <source src={src} type={file.mimeType} />
              </audio>
            </div>
          )}
          {!isImage && !isPDF && !isVideo && !isAudio && (
            <div className="text-center py-12">
              <FileIcon item={file} size="lg" />
              <p className="mt-4 text-gray-600 font-medium">{file.name}</p>
              <p className="text-sm text-gray-400 mt-1">Preview not available for this file type</p>
              <button onClick={onDownload} className="mt-4 btn-primary">
                <Download className="w-4 h-4" />
                Download to view
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
