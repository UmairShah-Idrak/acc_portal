import { useState, useEffect } from 'react';
import { X, Download, AlertCircle, Loader } from 'lucide-react';
import * as XLSX from 'xlsx';
import FileIcon from './FileIcon';

function isSpreadsheetType(file) {
  const mime = file.mimeType || '';
  const name = (file.name || '').toLowerCase();
  return (
    mime === 'text/csv' ||
    mime === 'application/vnd.ms-excel' ||
    mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mime === 'application/vnd.oasis.opendocument.spreadsheet' ||
    name.endsWith('.csv') ||
    name.endsWith('.xls') ||
    name.endsWith('.xlsx') ||
    name.endsWith('.ods')
  );
}

const MAX_ROWS = 2000;

export default function PreviewModal({ file, onClose, onDownload }) {
  const isImage = file.mimeType?.startsWith('image/');
  const isPDF   = file.mimeType === 'application/pdf';
  const isVideo = file.mimeType?.startsWith('video/');
  const isAudio = file.mimeType?.startsWith('audio/');
  const isSheet = isSpreadsheetType(file);

  // Spreadsheet state
  const [sheetNames, setSheetNames] = useState([]);
  const [sheetsData, setSheetsData] = useState({});   // { sheetName: [[...rows]] }
  const [activeSheet, setActiveSheet] = useState('');
  const [loadingSheet, setLoadingSheet] = useState(false);
  const [sheetError, setSheetError] = useState('');

  // For image/PDF/video — use object URL so auth header is sent
  const [blobUrl, setBlobUrl] = useState('');
  const [loadingMedia, setLoadingMedia] = useState(false);

  useEffect(() => {
    if (isSheet) loadSpreadsheet();
    else if (isImage || isPDF || isVideo) loadMedia();
    return () => { if (blobUrl) URL.revokeObjectURL(blobUrl); };
  }, []);

  // ── Fetch helpers ─────────────────────────────────────────────────────────

  async function fetchFile(asType = 'arraybuffer') {
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/files/${file._id}/preview`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    return asType === 'text' ? res.text() : res.arrayBuffer();
  }

  async function loadMedia() {
    setLoadingMedia(true);
    try {
      const buf = await fetchFile('arraybuffer');
      const url = URL.createObjectURL(new Blob([buf], { type: file.mimeType }));
      setBlobUrl(url);
    } catch { /* fallback: show download */ }
    finally { setLoadingMedia(false); }
  }

  async function loadSpreadsheet() {
    setLoadingSheet(true);
    setSheetError('');
    try {
      const buf = await fetchFile('arraybuffer');
      const wb = XLSX.read(buf, { type: 'array', cellDates: true });
      const names = wb.SheetNames;
      const data = {};
      names.forEach(name => {
        const ws = wb.Sheets[name];
        data[name] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      });
      setSheetNames(names);
      setSheetsData(data);
      setActiveSheet(names[0] || '');
    } catch (err) {
      setSheetError('Could not parse this file. Try downloading it.');
    } finally {
      setLoadingSheet(false);
    }
  }

  // ── Spreadsheet table ─────────────────────────────────────────────────────

  const rows = sheetsData[activeSheet] || [];
  const header = rows[0] || [];
  const body   = rows.slice(1, MAX_ROWS + 1);
  const truncated = rows.length - 1 > MAX_ROWS;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className={`bg-white rounded-2xl shadow-2xl flex flex-col ${isSheet ? 'w-full max-w-6xl' : 'w-full max-w-4xl'} max-h-[92vh]`}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <FileIcon item={file} size="sm" />
            <span className="font-medium text-gray-900 text-sm truncate max-w-md">{file.name}</span>
            {isSheet && rows.length > 0 && (
              <span className="text-xs text-gray-400 whitespace-nowrap">
                {rows.length - 1} rows · {header.length} cols
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={onDownload} className="btn-secondary text-sm py-1.5 px-3">
              <Download className="w-4 h-4" />
              Download
            </button>
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Sheet tabs (XLSX multi-sheet) */}
        {isSheet && sheetNames.length > 1 && (
          <div className="flex gap-1 px-6 pt-3 pb-0 border-b border-gray-100 overflow-x-auto flex-shrink-0">
            {sheetNames.map(name => (
              <button
                key={name}
                onClick={() => setActiveSheet(name)}
                className={`px-4 py-2 text-xs font-medium rounded-t-lg border-b-2 transition-colors whitespace-nowrap ${
                  activeSheet === name
                    ? 'border-blue-600 text-blue-700 bg-blue-50'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col rounded-b-2xl bg-gray-50">

          {/* ── Loading ── */}
          {(loadingSheet || loadingMedia) && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <Loader className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-3" />
                <p className="text-sm text-gray-500">Loading preview…</p>
              </div>
            </div>
          )}

          {/* ── Spreadsheet table ── */}
          {isSheet && !loadingSheet && !sheetError && rows.length > 0 && (
            <div className="flex-1 overflow-auto">
              {truncated && (
                <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 text-xs text-amber-700 flex items-center gap-2 flex-shrink-0">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  Showing first {MAX_ROWS.toLocaleString()} of {(rows.length - 1).toLocaleString()} rows. Download the file to see all data.
                </div>
              )}
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr>
                    {/* Row number column */}
                    <th className="bg-gray-100 border border-gray-200 px-2 py-1.5 text-gray-400 font-medium text-right w-10 select-none">#</th>
                    {header.map((cell, ci) => (
                      <th
                        key={ci}
                        className="bg-gray-100 border border-gray-200 px-3 py-1.5 text-gray-700 font-semibold text-left whitespace-nowrap min-w-[80px] max-w-[240px]"
                      >
                        {String(cell ?? '')}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {body.map((row, ri) => (
                    <tr key={ri} className={ri % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="border border-gray-200 px-2 py-1.5 text-gray-300 text-right select-none font-mono">
                        {ri + 1}
                      </td>
                      {header.map((_, ci) => {
                        const val = row[ci];
                        const display = val instanceof Date
                          ? val.toLocaleDateString()
                          : String(val ?? '');
                        return (
                          <td
                            key={ci}
                            className="border border-gray-200 px-3 py-1.5 text-gray-700 max-w-[240px] truncate"
                            title={display}
                          >
                            {display}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Empty sheet */}
          {isSheet && !loadingSheet && !sheetError && rows.length === 0 && (
            <div className="flex-1 flex items-center justify-center text-sm text-gray-400">This sheet is empty</div>
          )}

          {/* Sheet parse error */}
          {isSheet && sheetError && (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <AlertCircle className="w-10 h-10 text-red-400 mb-3" />
              <p className="text-gray-600 font-medium">{sheetError}</p>
              <button onClick={onDownload} className="mt-4 btn-primary">
                <Download className="w-4 h-4" /> Download
              </button>
            </div>
          )}

          {/* ── Image ── */}
          {isImage && !loadingMedia && blobUrl && (
            <div className="flex-1 overflow-auto flex items-center justify-center p-4">
              <img src={blobUrl} alt={file.name} className="max-w-full max-h-full object-contain rounded-lg shadow" />
            </div>
          )}

          {/* ── PDF ── */}
          {isPDF && !loadingMedia && blobUrl && (
            <div className="flex-1 p-4">
              <iframe src={blobUrl} className="w-full h-full min-h-[500px] rounded-lg" title={file.name} />
            </div>
          )}

          {/* ── Video ── */}
          {isVideo && !loadingMedia && blobUrl && (
            <div className="flex-1 flex items-center justify-center p-4">
              <video controls className="max-w-full max-h-full rounded-lg shadow">
                <source src={blobUrl} type={file.mimeType} />
              </video>
            </div>
          )}

          {/* ── Audio ── */}
          {isAudio && (
            <div className="flex-1 flex flex-col items-center justify-center p-8">
              <FileIcon item={file} size="lg" />
              <p className="mt-4 text-sm text-gray-600 font-medium">{file.name}</p>
              <audio controls className="mt-4">
                <source src={`/api/files/${file._id}/preview`} type={file.mimeType} />
              </audio>
            </div>
          )}

          {/* ── Unsupported ── */}
          {!isImage && !isPDF && !isVideo && !isAudio && !isSheet && (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-12">
              <FileIcon item={file} size="lg" />
              <p className="mt-4 text-gray-600 font-medium">{file.name}</p>
              <p className="text-sm text-gray-400 mt-1">Preview not available for this file type</p>
              <button onClick={onDownload} className="mt-4 btn-primary">
                <Download className="w-4 h-4" /> Download to view
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
