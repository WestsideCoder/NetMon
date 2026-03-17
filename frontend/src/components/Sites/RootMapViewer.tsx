// SPDX-License-Identifier: GPL-3.0-or-later
import { useState, useEffect, useRef, useCallback } from 'react';
import { ZoomIn, ZoomOut, Maximize, Edit3, Save, X, Upload, Image, ImageOff } from 'lucide-react';
import api from '../../api/client';
import type { SiteChildWithStats } from '../../types';
import SiteMarker from './SiteMarker';
import SiteTooltip from './SiteTooltip';
import { useRole } from '../../hooks/useRole';

interface Props {
  onSelectSite: (siteId: number) => void;
}

export default function RootMapViewer({ onSelectSite }: Props) {
  const [mapUrl, setMapUrl] = useState<string | null>(null);
  const [children, setChildren] = useState<SiteChildWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState(() => {
    const saved = localStorage.getItem('map-zoom-root');
    return saved ? Number(saved) : 1;
  });
  const [selectedChild, setSelectedChild] = useState<SiteChildWithStats | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editPositions, setEditPositions] = useState<Record<number, { x: number; y: number }>>({});
  const [saving, setSaving] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [imageDims, setImageDims] = useState<{ w: number; h: number } | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { canEdit } = useRole();

  // Compute zoom that fits the entire image in the visible container
  const computeFitZoom = useCallback(() => {
    if (!imageDims || !scrollRef.current) return 1;
    const containerW = scrollRef.current.clientWidth;
    const containerH = scrollRef.current.clientHeight || scrollRef.current.parentElement?.clientHeight || window.innerHeight - 250;
    const imageDisplayH = containerW * (imageDims.h / imageDims.w);
    if (imageDisplayH <= containerH) return 1;
    return Math.max(0.1, containerH / imageDisplayH);
  }, [imageDims]);

  // Auto-fit zoom when image dimensions are known
  useEffect(() => {
    if (!imageDims) return;
    setZoom(computeFitZoom());
  }, [imageDims, computeFitZoom]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [mapRes, childRes] = await Promise.all([
        api.get('/api/sites/root-map'),
        api.get('/api/sites/root-children'),
      ]);
      setMapUrl(mapRes.data.map_image_url);
      setChildren(childRes.data);
    } catch { /* empty */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    localStorage.setItem('map-zoom-root', String(zoom));
  }, [zoom]);

  const handleChildClick = (child: SiteChildWithStats) => {
    if (editMode) return;
    setSelectedChild(prev => prev?.id === child.id ? null : child);
  };

  const handleDrillDown = (child: SiteChildWithStats) => {
    onSelectSite(child.id);
  };

  const handleSiteDragStart = (e: React.PointerEvent, child: SiteChildWithStats) => {
    if (!editMode || !mapRef.current) return;
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);

    const onMove = (me: PointerEvent) => {
      const rect = mapRef.current!.getBoundingClientRect();
      const x = ((me.clientX - rect.left) / rect.width) * 100;
      const y = ((me.clientY - rect.top) / rect.height) * 100;
      setEditPositions(prev => ({ ...prev, [child.id]: { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) } }));
    };
    const onUp = () => { el.removeEventListener('pointermove', onMove); el.removeEventListener('pointerup', onUp); };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
  };

  const handleDropOnMap = (e: React.DragEvent) => {
    if (!mapRef.current) return;
    e.preventDefault();
    const rect = mapRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    const siteId = e.dataTransfer.getData('site-id');
    if (siteId) setEditPositions(prev => ({ ...prev, [Number(siteId)]: { x, y } }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const positions = Object.entries(editPositions).map(([id, pos]) => ({
        id: Number(id), map_x: pos.x, map_y: pos.y,
      }));
      if (positions.length > 0) {
        await api.patch('/api/sites/positions', positions);
      }
      setEditMode(false);
      setEditPositions({});
      fetchData();
    } catch { /* empty */ }
    setSaving(false);
  };

  const handleDeleteImage = async () => {
    try {
      await api.delete('/api/sites/root-map');
      setMapUrl(null);
      setImageError(false);
    } catch { /* empty */ }
  };

  const handleUploadSuccess = () => {
    setShowUpload(false);
    setImageDims(null);
    fetchData();
    setImageError(false);
  };

  const getSitePosition = (child: SiteChildWithStats) => {
    const edit = editPositions[child.id];
    if (edit) return { map_x: edit.x, map_y: edit.y };
    return { map_x: child.map_x, map_y: child.map_y };
  };

  const positionedChildren = children.filter(c => {
    const pos = getSitePosition(c);
    return pos.map_x != null && pos.map_y != null;
  });

  const unpositionedChildren = children.filter(c => {
    const pos = getSitePosition(c);
    return pos.map_x == null || pos.map_y == null;
  });

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto" />
      </div>
    );
  }

  // No root map uploaded
  if (!mapUrl) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
        <Image className="h-12 w-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500 dark:text-gray-400 mb-1">No overview map uploaded</p>
        <p className="text-xs text-gray-400 mb-3">Upload a map image to place your top-level sites on it</p>
        {canEdit && (
          <>
            <button
              onClick={() => setShowUpload(true)}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Upload className="h-4 w-4" /> Upload Overview Map
            </button>
            {showUpload && (
              <RootMapUploadModal
                onSuccess={handleUploadSuccess}
                onCancel={() => setShowUpload(false)}
              />
            )}
          </>
        )}
      </div>
    );
  }

  const placedCount = positionedChildren.length;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold dark:text-white">Overview Map</h2>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {children.length} site{children.length !== 1 ? 's' : ''}
            {placedCount < children.length && ` (${placedCount} placed)`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <>
              {mapUrl && (
                <button onClick={handleDeleteImage} className="flex items-center gap-1 px-3 py-1.5 text-xs border rounded-lg hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700" title="Remove map image">
                  <ImageOff className="h-3.5 w-3.5" />
                </button>
              )}
              <button onClick={() => setShowUpload(true)} className="flex items-center gap-1 px-3 py-1.5 text-xs border rounded-lg hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700" title="Upload map image">
                <Image className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          {editMode ? (
            <>
              <button onClick={() => { setEditMode(false); setEditPositions({}); }} className="flex items-center gap-1 px-3 py-1.5 text-xs border rounded-lg hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">
                <X className="h-3.5 w-3.5" /> Cancel
              </button>
              <button onClick={handleSave} disabled={saving} className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                <Save className="h-3.5 w-3.5" /> {saving ? 'Saving...' : 'Save Positions'}
              </button>
            </>
          ) : (
            canEdit && (
              <button onClick={() => setEditMode(true)} className="flex items-center gap-1 px-3 py-1.5 text-xs border rounded-lg hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">
                <Edit3 className="h-3.5 w-3.5" /> Edit Positions
              </button>
            )
          )}
        </div>
      </div>

      <div className="flex gap-3">
        {/* Main map area */}
        <div className="flex-1 bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden relative">
          <div ref={scrollRef} className="overflow-auto" style={{ position: 'relative', maxHeight: 'calc(100vh - 14rem)' }}>
            <div
              ref={mapRef}
              className="relative"
              style={{ transform: `scale(${zoom})`, transformOrigin: 'top left', width: zoom > 1 ? `${100 / zoom}%` : '100%' }}
              onClick={() => { setSelectedChild(null); }}
              onDragOver={editMode ? (e) => e.preventDefault() : undefined}
              onDrop={editMode ? handleDropOnMap : undefined}
            >
              {imageError ? (
                <div className="w-full h-64 flex items-center justify-center bg-gray-100 dark:bg-gray-700">
                  <div className="text-center">
                    <Image className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500 dark:text-gray-400">Failed to load map image</p>
                  </div>
                </div>
              ) : (
                <img
                  src={mapUrl}
                  alt="Overview map"
                  className="w-full block"
                  draggable={false}
                  onError={() => setImageError(true)}
                  onLoad={(e) => {
                    const img = e.currentTarget;
                    setImageDims({ w: img.naturalWidth, h: img.naturalHeight });
                  }}
                />
              )}
              {/* Site markers */}
              {positionedChildren.map(child => {
                const pos = getSitePosition(child);
                return (
                  <SiteMarker
                    key={`site-${child.id}`}
                    child={{ ...child, map_x: pos.map_x!, map_y: pos.map_y! }}
                    isEditMode={editMode}
                    isSelected={selectedChild?.id === child.id}
                    onClick={handleChildClick}
                    onDragStart={handleSiteDragStart}
                  />
                );
              })}
              {/* Tooltip */}
              {selectedChild && !editMode && (() => {
                const pos = getSitePosition(selectedChild);
                return pos.map_x != null && pos.map_y != null ? (
                  <SiteTooltip
                    child={{ ...selectedChild, map_x: pos.map_x, map_y: pos.map_y }}
                    onClose={() => setSelectedChild(null)}
                    onDrillDown={handleDrillDown}
                  />
                ) : null;
              })()}
            </div>
          </div>

          {/* Zoom controls */}
          <div className="absolute bottom-3 right-3 flex flex-col gap-1 bg-white dark:bg-gray-700 rounded-lg shadow border dark:border-gray-600">
            <button onClick={() => setZoom(z => Math.min(3, z + 0.25))} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-t-lg" title="Zoom in">
              <ZoomIn className="h-4 w-4 text-gray-600 dark:text-gray-300" />
            </button>
            <button onClick={() => setZoom(1)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-600 text-[10px] text-gray-500 font-mono" title="Reset zoom">
              {Math.round(zoom * 100)}%
            </button>
            <button onClick={() => setZoom(z => Math.max(0.1, +(z - 0.25).toFixed(2)))} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-600" title="Zoom out">
              <ZoomOut className="h-4 w-4 text-gray-600 dark:text-gray-300" />
            </button>
            <button onClick={() => setZoom(computeFitZoom())} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-b-lg" title="Fit to frame">
              <Maximize className="h-4 w-4 text-gray-600 dark:text-gray-300" />
            </button>
          </div>
        </div>

        {/* Unpositioned sidebar (edit mode) */}
        {editMode && unpositionedChildren.length > 0 && (
          <div className="w-48 bg-white dark:bg-gray-800 rounded-lg shadow p-3 shrink-0">
            <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">
              Unplaced ({unpositionedChildren.length})
            </h4>
            <div className="space-y-1 max-h-[550px] overflow-y-auto">
              {unpositionedChildren.map(child => (
                <div
                  key={child.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('site-id', String(child.id))}
                  className="flex items-center gap-2 px-2 py-1.5 rounded text-xs cursor-grab hover:bg-gray-100 dark:hover:bg-gray-700 border dark:border-gray-700"
                >
                  <span className="truncate dark:text-gray-300">{child.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {showUpload && (
        <RootMapUploadModal
          onSuccess={handleUploadSuccess}
          onCancel={() => setShowUpload(false)}
        />
      )}
    </div>
  );
}

/** Simple upload modal for the root map image */
function RootMapUploadModal({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const handleFile = async (file: File) => {
    setUploading(true);
    setError('');
    const formData = new FormData();
    formData.append('file', file);
    try {
      await api.post('/api/sites/root-map', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      onSuccess();
    } catch {
      setError('Upload failed');
    }
    setUploading(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold dark:text-white mb-4">Upload Overview Map</h3>
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        <div
          className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-blue-400 dark:border-gray-600 dark:hover:border-blue-500"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
          onClick={() => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = () => { if (input.files?.[0]) handleFile(input.files[0]); };
            input.click();
          }}
        >
          <Upload className="h-8 w-8 text-gray-400 mx-auto mb-2" />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {uploading ? 'Uploading...' : 'Drop an image here or click to browse'}
          </p>
          <p className="text-xs text-gray-400 mt-1">PNG, JPG, GIF, WebP (max 10MB)</p>
        </div>
        <div className="flex justify-end mt-4">
          <button onClick={onCancel} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
