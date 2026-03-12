// SPDX-License-Identifier: GPL-3.0-or-later
import { useState, useEffect } from 'react';
import { MapPin } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';
import type { Device, Site } from '../../types';

interface Props {
  device: Device;
}

export default function DeviceLocationMap({ device }: Props) {
  const [site, setSite] = useState<Site | null>(null);
  const [siblings, setSiblings] = useState<Device[]>([]);
  const [imageError, setImageError] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!device.site_id || device.map_x == null || device.map_y == null) return;
    let cancelled = false;

    const load = async () => {
      try {
        const [siteRes, devicesRes] = await Promise.all([
          api.get(`/api/sites/${device.site_id}`),
          api.get('/api/devices/', { params: { site_id: device.site_id, per_page: 200 } }),
        ]);
        if (cancelled) return;
        setSite(siteRes.data);
        setSiblings(devicesRes.data.items.filter((d: Device) => d.map_x != null && d.map_y != null));
      } catch { /* empty */ }
    };

    load();
    return () => { cancelled = true; };
  }, [device.id, device.site_id, device.map_x, device.map_y]);

  // Don't render if device has no position or site has no map
  if (device.map_x == null || device.map_y == null || !site?.map_image_url) return null;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
      <div className="px-5 py-3 border-b dark:border-gray-700 flex items-center gap-2">
        <MapPin className="h-4 w-4 text-blue-500" />
        <h3 className="text-sm font-semibold dark:text-white">Location — {site.name}</h3>
      </div>
      <div className="relative overflow-auto" style={{ maxHeight: 'calc(100vh - 14rem)' }}>
        {imageError ? (
          <div className="w-full h-48 flex items-center justify-center bg-gray-100 dark:bg-gray-700">
            <p className="text-sm text-gray-400">Failed to load map</p>
          </div>
        ) : (
          <img
            src={site.map_image_url}
            alt="Site map"
            className="w-full block"
            draggable={false}
            onError={() => setImageError(true)}
          />
        )}
        {/* Sibling markers (faded) */}
        {siblings.filter(d => d.id !== device.id).map(d => (
          <div
            key={d.id}
            className="absolute -translate-x-1/2 -translate-y-1/2 z-10 cursor-pointer opacity-50 hover:opacity-80 transition-opacity"
            style={{ left: `${d.map_x}%`, top: `${d.map_y}%` }}
            onClick={() => navigate(`/devices/${d.id}`)}
            title={d.name}
          >
            <div className={`w-5 h-5 rounded-full flex items-center justify-center shadow ${
              d.status === 'online' ? 'bg-green-500' :
              d.status === 'warning' ? 'bg-yellow-500' :
              d.status === 'offline' ? 'bg-red-500' : 'bg-gray-400'
            }`}>
              <div className="w-1.5 h-1.5 rounded-full bg-white" />
            </div>
          </div>
        ))}
        {/* Current device marker (highlighted) */}
        <div
          className="absolute -translate-x-1/2 -translate-y-1/2 z-20"
          style={{ left: `${device.map_x}%`, top: `${device.map_y}%` }}
        >
          <div className={`w-7 h-7 rounded-full flex items-center justify-center shadow-lg ring-4 ring-blue-300 ${
            device.status === 'online' ? 'bg-green-500' :
            device.status === 'warning' ? 'bg-yellow-500' :
            device.status === 'offline' ? 'bg-red-500' : 'bg-gray-400'
          }`}>
            <div className="w-2 h-2 rounded-full bg-white" />
          </div>
          <div className="absolute left-1/2 -translate-x-1/2 -top-6 bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap font-medium">
            {device.name}
          </div>
        </div>
      </div>
    </div>
  );
}
