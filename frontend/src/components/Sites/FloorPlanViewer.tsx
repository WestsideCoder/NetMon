// SPDX-License-Identifier: GPL-3.0-or-later
import { useState, useEffect, useRef, useCallback } from 'react';
import { ZoomIn, ZoomOut, Maximize, Edit3, Save, X, Upload, Image, Building2, LayoutGrid } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import type { Device, Site, SiteChildWithStats } from '../../types';
import DeviceMarker from './DeviceMarker';
import DeviceTooltip from './DeviceTooltip';
import SiteMarker from './SiteMarker';
import SiteTooltip from './SiteTooltip';
import { useRole } from '../../hooks/useRole';

interface Props {
  site: Site;
  children?: SiteChildWithStats[];
  onUploadImage: () => void;
  onReload: () => void;
  onDrillDown?: (child: SiteChildWithStats) => void;
}

export default function FloorPlanViewer({ site, children: childSites, onUploadImage, onReload, onDrillDown }: Props) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const zoomKey = `map-zoom-site-${site.id}`;
  const [zoom, setZoom] = useState(() => {
    const saved = localStorage.getItem(zoomKey);
    return saved ? Number(saved) : 1;
  });
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [selectedChild, setSelectedChild] = useState<SiteChildWithStats | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editPositions, setEditPositions] = useState<Record<number, { x: number; y: number }>>({});
  const [editSitePositions, setEditSitePositions] = useState<Record<number, { x: number; y: number }>>({});
  const [saving, setSaving] = useState(false);
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

  const fetchDevices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/devices/', { params: { site_id: site.id, per_page: 200 } });
      setDevices(res.data.items);
    } catch { /* empty */ }
    setLoading(false);
  }, [site.id]);

  useEffect(() => {
    fetchDevices();
    setSelectedDevice(null);
    setSelectedChild(null);
    setEditMode(false);
    setEditPositions({});
    setEditSitePositions({});
    setImageDims(null);
    setImageError(false);
  }, [fetchDevices]);

  // Auto-fit zoom when image dimensions are known or container resizes
  useEffect(() => {
    if (!imageDims) return;
    setZoom(computeFitZoom());
  }, [imageDims, computeFitZoom]);

  useEffect(() => {
    localStorage.setItem(`map-zoom-site-${site.id}`, String(zoom));
  }, [zoom, site.id]);

  const handleMarkerClick = (device: Device) => {
    if (editMode) return;
    setSelectedChild(null);
    setSelectedDevice(prev => prev?.id === device.id ? null : device);
  };

  const handleChildClick = (child: SiteChildWithStats) => {
    if (editMode) return;
    setSelectedDevice(null);
    setSelectedChild(prev => prev?.id === child.id ? null : child);
  };

  const handleDragStart = (e: React.PointerEvent, device: Device) => {
    if (!editMode || !mapRef.current) return;
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);

    const onMove = (me: PointerEvent) => {
      const rect = mapRef.current!.getBoundingClientRect();
      const x = ((me.clientX - rect.left) / rect.width) * 100;
      const y = ((me.clientY - rect.top) / rect.height) * 100;
      const cx = Math.max(0, Math.min(100, x));
      const cy = Math.max(0, Math.min(100, y));
      setEditPositions(prev => ({ ...prev, [device.id]: { x: cx, y: cy } }));
    };

    const onUp = () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
    };

    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
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
      const cx = Math.max(0, Math.min(100, x));
      const cy = Math.max(0, Math.min(100, y));
      setEditSitePositions(prev => ({ ...prev, [child.id]: { x: cx, y: cy } }));
    };

    const onUp = () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
    };

    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
  };

  const handleMapClick = (_e: React.MouseEvent) => {
    if (!editMode || !mapRef.current) {
      setSelectedDevice(null);
      setSelectedChild(null);
      return;
    }
    setSelectedDevice(null);
    setSelectedChild(null);
  };

  const handleDropOnMap = (e: React.DragEvent) => {
    if (!mapRef.current) return;
    e.preventDefault();
    const rect = mapRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    const cx = Math.max(0, Math.min(100, x));
    const cy = Math.max(0, Math.min(100, y));

    const deviceId = e.dataTransfer.getData('device-id');
    if (deviceId) {
      setEditPositions(prev => ({ ...prev, [Number(deviceId)]: { x: cx, y: cy } }));
      return;
    }
    const siteId = e.dataTransfer.getData('site-id');
    if (siteId) {
      setEditSitePositions(prev => ({ ...prev, [Number(siteId)]: { x: cx, y: cy } }));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const devicePositions = Object.entries(editPositions).map(([id, pos]) => ({
        id: Number(id),
        map_x: pos.x,
        map_y: pos.y,
      }));
      const sitePositions = Object.entries(editSitePositions).map(([id, pos]) => ({
        id: Number(id),
        map_x: pos.x,
        map_y: pos.y,
      }));
      const promises: Promise<any>[] = [];
      if (devicePositions.length > 0) {
        promises.push(api.patch('/api/devices/positions', devicePositions));
      }
      if (sitePositions.length > 0) {
        promises.push(api.patch('/api/sites/positions', sitePositions));
      }
      await Promise.all(promises);
      setEditMode(false);
      setEditPositions({});
      setEditSitePositions({});
      fetchDevices();
      onReload();
    } catch { /* empty */ }
    setSaving(false);
  };

  const handleCancelEdit = () => {
    setEditMode(false);
    setEditPositions({});
    setEditSitePositions({});
  };

  const handlePlaceAll = () => {
    const items: { type: 'device' | 'site'; id: number }[] = [
      ...unpositionedChildren.map(c => ({ type: 'site' as const, id: c.id })),
      ...unpositionedDevices.map(d => ({ type: 'device' as const, id: d.id })),
    ];
    if (items.length === 0) return;

    // Calculate grid: leave 5% padding on each side, distribute evenly
    const padding = 5;
    const usable = 100 - padding * 2;
    const cols = Math.ceil(Math.sqrt(items.length));
    const rows = Math.ceil(items.length / cols);
    const cellW = usable / cols;
    const cellH = usable / rows;

    const newDevPos = { ...editPositions };
    const newSitePos = { ...editSitePositions };

    items.forEach((item, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = padding + col * cellW + cellW / 2;
      const y = padding + row * cellH + cellH / 2;
      if (item.type === 'device') {
        newDevPos[item.id] = { x, y };
      } else {
        newSitePos[item.id] = { x, y };
      }
    });

    setEditPositions(newDevPos);
    setEditSitePositions(newSitePos);
  };

  // Merge edit positions with actual device positions
  const getDevicePosition = (device: Device) => {
    const edit = editPositions[device.id];
    if (edit) return { map_x: edit.x, map_y: edit.y };
    return { map_x: device.map_x, map_y: device.map_y };
  };

  const getSitePosition = (child: SiteChildWithStats) => {
    const edit = editSitePositions[child.id];
    if (edit) return { map_x: edit.x, map_y: edit.y };
    return { map_x: child.map_x, map_y: child.map_y };
  };

  const positionedDevices = devices.filter(d => {
    const pos = getDevicePosition(d);
    return pos.map_x != null && pos.map_y != null;
  });

  const unpositionedDevices = devices.filter(d => {
    const pos = getDevicePosition(d);
    return pos.map_x == null || pos.map_y == null;
  });

  const positionedChildren = (childSites || []).filter(c => {
    const pos = getSitePosition(c);
    return pos.map_x != null && pos.map_y != null;
  });

  const unpositionedChildren = (childSites || []).filter(c => {
    const pos = getSitePosition(c);
    return pos.map_x == null || pos.map_y == null;
  });

  const totalUnpositioned = unpositionedDevices.length + unpositionedChildren.length;

  // No floor plan uploaded
  if (!site.map_image_url) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
        <Image className="h-12 w-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500 dark:text-gray-400 mb-3">No floor plan uploaded for this site</p>
        {canEdit && (
          <button
            onClick={onUploadImage}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Upload className="h-4 w-4" /> Upload Floor Plan
          </button>
        )}
      </div>
    );
  }

  const itemCount = devices.length + (childSites || []).length;
  const placedCount = positionedDevices.length + positionedChildren.length;

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-gray-500 dark:text-gray-400">
          {itemCount} item{itemCount !== 1 ? 's' : ''}
          {placedCount < itemCount && ` (${placedCount} placed)`}
        </div>
        <div className="flex items-center gap-2">
          {editMode ? (
            <>
              <button onClick={handleCancelEdit} className="flex items-center gap-1 px-3 py-1.5 text-xs border rounded-lg hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">
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
              onClick={handleMapClick}
              onDragOver={editMode ? (e) => e.preventDefault() : undefined}
              onDrop={editMode ? handleDropOnMap : undefined}
            >
              {imageError ? (
                <div className="w-full h-64 flex items-center justify-center bg-gray-100 dark:bg-gray-700">
                  <div className="text-center">
                    <Image className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500 dark:text-gray-400">Failed to load floor plan image</p>
                  </div>
                </div>
              ) : (
                <img
                  src={site.map_image_url}
                  alt="Floor plan"
                  className="w-full block"
                  draggable={false}
                  onError={() => setImageError(true)}
                  onLoad={(e) => {
                    const img = e.currentTarget;
                    setImageDims({ w: img.naturalWidth, h: img.naturalHeight });
                  }}
                />
              )}
              {/* Child site markers */}
              {positionedChildren.map(child => {
                const pos = getSitePosition(child);
                const displayChild = { ...child, map_x: pos.map_x!, map_y: pos.map_y! };
                return (
                  <SiteMarker
                    key={`site-${child.id}`}
                    child={displayChild}
                    isEditMode={editMode}
                    isSelected={selectedChild?.id === child.id}
                    onClick={handleChildClick}
                    onDragStart={handleSiteDragStart}
                  />
                );
              })}
              {/* Device markers */}
              {positionedDevices.map(device => {
                const pos = getDevicePosition(device);
                const displayDevice = { ...device, map_x: pos.map_x!, map_y: pos.map_y! };
                return (
                  <DeviceMarker
                    key={device.id}
                    device={displayDevice}
                    isEditMode={editMode}
                    isSelected={selectedDevice?.id === device.id}
                    onClick={handleMarkerClick}
                    onDragStart={handleDragStart}
                  />
                );
              })}
              {/* Device Tooltip */}
              {selectedDevice && !editMode && (() => {
                const pos = getDevicePosition(selectedDevice);
                return pos.map_x != null && pos.map_y != null ? (
                  <DeviceTooltip
                    device={{ ...selectedDevice, map_x: pos.map_x, map_y: pos.map_y }}
                    onClose={() => setSelectedDevice(null)}
                  />
                ) : null;
              })()}
              {/* Site Tooltip */}
              {selectedChild && !editMode && onDrillDown && (() => {
                const pos = getSitePosition(selectedChild);
                return pos.map_x != null && pos.map_y != null ? (
                  <SiteTooltip
                    child={{ ...selectedChild, map_x: pos.map_x, map_y: pos.map_y }}
                    onClose={() => setSelectedChild(null)}
                    onDrillDown={onDrillDown}
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

          {loading && (
            <div className="absolute inset-0 bg-white/60 dark:bg-gray-800/60 flex items-center justify-center">
              <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
            </div>
          )}
        </div>

        {/* Unpositioned items sidebar (edit mode only) */}
        {editMode && totalUnpositioned > 0 && (
          <div className="w-48 bg-white dark:bg-gray-800 rounded-lg shadow p-3 shrink-0">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                Unplaced ({totalUnpositioned})
              </h4>
              <button
                onClick={handlePlaceAll}
                className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-gray-700 rounded"
                title="Place all items in a grid on the map"
              >
                <LayoutGrid className="h-3 w-3" /> Place All
              </button>
            </div>
            <div className="space-y-1 max-h-[550px] overflow-y-auto">
              {/* Unpositioned child sites */}
              {unpositionedChildren.map(child => (
                <div
                  key={`site-${child.id}`}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('site-id', String(child.id))}
                  className="flex items-center gap-2 px-2 py-1.5 rounded text-xs cursor-grab hover:bg-gray-100 dark:hover:bg-gray-700 border dark:border-gray-700"
                >
                  <Building2 className={`h-3 w-3 shrink-0 ${child.device_stats.offline > 0 ? 'text-red-500' : child.device_stats.warning > 0 ? 'text-yellow-500' : 'text-blue-500'}`} />
                  <span className={`truncate ${child.device_stats.offline > 0 ? 'text-red-600 dark:text-red-400 font-medium' : child.device_stats.warning > 0 ? 'text-yellow-600 dark:text-yellow-400 font-medium' : 'dark:text-gray-300'}`}>{child.name}</span>
                </div>
              ))}
              {/* Unpositioned devices */}
              {unpositionedDevices.map(device => (
                <div
                  key={device.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('device-id', String(device.id))}
                  className="flex items-center gap-2 px-2 py-1.5 rounded text-xs cursor-grab hover:bg-gray-100 dark:hover:bg-gray-700 border dark:border-gray-700"
                >
                  <div className={`w-2 h-2 rounded-full shrink-0 ${
                    device.status === 'online' ? 'bg-green-500' :
                    device.status === 'warning' ? 'bg-yellow-500' :
                    device.status === 'offline' ? 'bg-red-500' : 'bg-gray-400'
                  }`} />
                  <Link to={`/devices/${device.id}`} className="truncate text-primary-600 hover:underline dark:text-primary-400">{device.name}</Link>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
