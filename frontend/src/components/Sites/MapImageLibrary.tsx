// SPDX-License-Identifier: GPL-3.0-or-later
import { useState, useEffect } from 'react';
import { Trash2 } from 'lucide-react';
import api from '../../api/client';
import type { MapImage } from '../../types';
import { useRole } from '../../hooks/useRole';

interface Props {
  onSelect: (image: MapImage) => void;
  selectedId?: number | null;
}

export default function MapImageLibrary({ onSelect, selectedId }: Props) {
  const [images, setImages] = useState<MapImage[]>([]);
  const [loading, setLoading] = useState(true);
  const { canEdit: canDelete } = useRole();

  const fetchImages = async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/map-images/');
      setImages(res.data.items);
    } catch { /* empty */ }
    setLoading(false);
  };

  useEffect(() => { fetchImages(); }, []);

  const handleDelete = async (e: React.MouseEvent, imageId: number) => {
    e.stopPropagation();
    if (!confirm('Delete this image from the library?')) return;
    try {
      await api.delete(`/api/map-images/${imageId}`);
      setImages(prev => prev.filter(i => i.id !== imageId));
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to delete');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin h-6 w-6 border-3 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (images.length === 0) {
    return (
      <p className="text-sm text-gray-400 text-center py-8">
        No images in library. Upload one first.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 max-h-64 overflow-y-auto">
      {images.map(img => (
        <div
          key={img.id}
          onClick={() => onSelect(img)}
          className={`relative group cursor-pointer rounded-lg border-2 overflow-hidden transition-colors ${
            selectedId === img.id
              ? 'border-blue-500 ring-2 ring-blue-200'
              : 'border-gray-200 dark:border-gray-700 hover:border-blue-300'
          }`}
        >
          <img
            src={img.url}
            alt={img.name}
            className="w-full h-24 object-cover bg-gray-50 dark:bg-gray-900"
          />
          <div className="px-2 py-1 text-xs truncate dark:text-gray-300">{img.name}</div>
          {canDelete && (
            <button
              onClick={(e) => handleDelete(e, img.id)}
              className="absolute top-1 right-1 p-1 bg-white dark:bg-gray-800 rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Trash2 className="h-3 w-3 text-red-500" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
