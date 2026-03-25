// SPDX-License-Identifier: GPL-3.0-or-later
import { X, ExternalLink } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import type { Device } from '../../types';

const STATUS_BADGE: Record<string, { bg: string; text: string }> = {
  online: { bg: 'bg-green-100 dark:bg-green-900/40', text: 'text-green-700 dark:text-green-300' },
  warning: { bg: 'bg-yellow-100 dark:bg-yellow-900/40', text: 'text-yellow-700 dark:text-yellow-300' },
  offline: { bg: 'bg-red-100 dark:bg-red-900/40', text: 'text-red-700 dark:text-red-300' },
  maintenance: { bg: 'bg-blue-100 dark:bg-blue-900/40', text: 'text-blue-700 dark:text-blue-300' },
  unknown: { bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-600 dark:text-gray-300' },
};

interface Props {
  device: Device;
  onClose: () => void;
}

export default function DeviceTooltip({ device, onClose }: Props) {
  const navigate = useNavigate();
  const badge = STATUS_BADGE[device.status] || STATUS_BADGE.unknown;

  return (
    <div className="absolute z-30 bg-white dark:bg-gray-800 rounded-lg shadow-xl border dark:border-gray-700 w-64 p-3"
      style={{
        left: `${device.map_x}%`,
        top: `${device.map_y}%`,
        transform: 'translate(-50%, 16px)',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-2">
        <Link to={`/devices/${device.id}`} className="text-sm font-semibold text-primary-600 hover:underline dark:text-primary-400 truncate pr-2">{device.name}</Link>
        <button onClick={onClose} className="p-0.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
          <X className="h-3.5 w-3.5 text-gray-400" />
        </button>
      </div>

      <div className="space-y-1.5 text-xs">
        <div className="flex justify-between">
          <span className="text-gray-500 dark:text-gray-400">IP</span>
          <span className="font-mono dark:text-gray-300">{device.ip_address}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-gray-500 dark:text-gray-400">Status</span>
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase ${badge.bg} ${badge.text}`}>
            {device.status}
          </span>
        </div>
        {device.device_type && (
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">Type</span>
            <span className="dark:text-gray-300 capitalize">{device.device_type.replace('_', ' ')}</span>
          </div>
        )}
        {device.response_time != null && (
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">Response</span>
            <span className="dark:text-gray-300">{device.response_time.toFixed(1)}ms</span>
          </div>
        )}
      </div>

      <button
        onClick={() => navigate(`/devices/${device.id}`)}
        className="mt-3 w-full flex items-center justify-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 py-1.5 rounded border border-blue-200 dark:border-blue-800"
      >
        <ExternalLink className="h-3 w-3" /> View Details
      </button>
    </div>
  );
}
