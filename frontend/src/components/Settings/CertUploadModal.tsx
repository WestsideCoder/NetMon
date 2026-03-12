// SPDX-License-Identifier: GPL-3.0-or-later
import { useState, useRef } from 'react';
import { Upload, X } from 'lucide-react';
import api from '../../api/client';
import type { SSLCertificate } from '../../types';

interface Props {
  onClose: () => void;
  onUploaded: (cert: SSLCertificate) => void;
}

const MAX_SIZE = 1 * 1024 * 1024; // 1MB
const ALLOWED_EXTS = ['.pem', '.crt', '.key'];

export default function CertUploadModal({ onClose, onUploaded }: Props) {
  const [name, setName] = useState('');
  const [certFile, setCertFile] = useState<File | null>(null);
  const [keyFile, setKeyFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const certRef = useRef<HTMLInputElement>(null);
  const keyRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): string | null => {
    if (file.size > MAX_SIZE) return `${file.name} is too large (max 1MB)`;
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (!ALLOWED_EXTS.includes(ext)) return `${file.name}: unsupported format. Use .pem, .crt, or .key`;
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!certFile || !keyFile) {
      setError('Both certificate and key files are required');
      return;
    }

    const certErr = validateFile(certFile);
    if (certErr) { setError(certErr); return; }
    const keyErr = validateFile(keyFile);
    if (keyErr) { setError(keyErr); return; }

    setUploading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('cert_file', certFile);
      formData.append('key_file', keyFile);
      formData.append('name', name.trim() || 'Uploaded Certificate');

      const res = await api.post('/api/ssl/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      onUploaded(res.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Upload Certificate</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Wildcard Cert 2026"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Certificate File (.pem, .crt)</label>
            <input
              ref={certRef}
              type="file"
              accept=".pem,.crt"
              onChange={e => setCertFile(e.target.files?.[0] || null)}
              className="w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-blue-50 file:text-blue-700 file:font-medium file:cursor-pointer"
            />
            {certFile && <p className="text-xs text-gray-500 mt-1">{certFile.name}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Private Key File (.pem, .key)</label>
            <input
              ref={keyRef}
              type="file"
              accept=".pem,.key"
              onChange={e => setKeyFile(e.target.files?.[0] || null)}
              className="w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-blue-50 file:text-blue-700 file:font-medium file:cursor-pointer"
            />
            {keyFile && <p className="text-xs text-gray-500 mt-1">{keyFile.name}</p>}
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={uploading || !certFile || !keyFile}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              <Upload className="w-4 h-4" />
              {uploading ? 'Uploading...' : 'Upload'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
