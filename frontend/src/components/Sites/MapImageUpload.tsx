// SPDX-License-Identifier: GPL-3.0-or-later
import { useState, useRef } from 'react';
import { Upload, X, Image } from 'lucide-react';
import api from '../../api/client';
import type { MapImage } from '../../types';
import MapImageLibrary from './MapImageLibrary';

interface Props {
  siteId: number;
  onSuccess: () => void;
  onCancel: () => void;
}

type Tab = 'upload' | 'library';

export default function MapImageUpload({ siteId, onSuccess, onCancel }: Props) {
  const [tab, setTab] = useState<Tab>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [selectedLibImage, setSelectedLibImage] = useState<MapImage | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File) => {
    const allowed = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
    if (!allowed.includes(f.type)) {
      setError('Invalid file type. Use PNG, JPG, GIF, or WebP.');
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setError('File too large (max 10MB).');
      return;
    }
    setError('');
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      // Upload to library first, then assign to site
      const libForm = new FormData();
      libForm.append('file', file);
      libForm.append('name', file.name);
      const libRes = await api.post('/api/map-images/', libForm, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      // Assign library image to site
      await api.post(`/api/sites/${siteId}/map-image-from-library?image_id=${libRes.data.id}`);
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleUseLibraryImage = async () => {
    if (!selectedLibImage) return;
    setUploading(true);
    setError('');
    try {
      await api.post(`/api/sites/${siteId}/map-image-from-library?image_id=${selectedLibImage.id}`);
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to assign image');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-3 border-b dark:border-gray-700">
          <h3 className="font-semibold dark:text-white">Set Floor Plan Image</h3>
          <button onClick={onCancel} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b dark:border-gray-700">
          <button
            onClick={() => setTab('upload')}
            className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
              tab === 'upload'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
            }`}
          >
            Upload New
          </button>
          <button
            onClick={() => setTab('library')}
            className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
              tab === 'library'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
            }`}
          >
            From Library
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && <div className="text-sm text-red-600 bg-red-50 dark:bg-red-900/30 px-3 py-2 rounded">{error}</div>}

          {tab === 'upload' && (
            <>
              {preview ? (
                <div className="relative">
                  <img src={preview} alt="Preview" className="w-full rounded border dark:border-gray-700 max-h-64 object-contain bg-gray-50 dark:bg-gray-900" />
                  <button
                    onClick={() => { setFile(null); setPreview(null); }}
                    className="absolute top-2 right-2 p-1 bg-white dark:bg-gray-800 rounded-full shadow"
                  >
                    <X className="h-3.5 w-3.5 text-gray-500" />
                  </button>
                </div>
              ) : (
                <div
                  className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors
                    ${dragOver ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-300 dark:border-gray-600'}`}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => inputRef.current?.click()}
                >
                  <Image className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Drag & drop an image here, or click to browse
                  </p>
                  <p className="text-xs text-gray-400 mt-1">PNG, JPG, GIF, WebP up to 10MB</p>
                  <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
                </div>
              )}
            </>
          )}

          {tab === 'library' && (
            <MapImageLibrary
              onSelect={setSelectedLibImage}
              selectedId={selectedLibImage?.id}
            />
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t dark:border-gray-700">
          <button onClick={onCancel} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">
            Cancel
          </button>
          {tab === 'upload' ? (
            <button
              onClick={handleUpload}
              disabled={!file || uploading}
              className="flex items-center gap-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              <Upload className="h-4 w-4" />
              {uploading ? 'Uploading...' : 'Upload'}
            </button>
          ) : (
            <button
              onClick={handleUseLibraryImage}
              disabled={!selectedLibImage || uploading}
              className="flex items-center gap-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {uploading ? 'Assigning...' : 'Use Image'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
