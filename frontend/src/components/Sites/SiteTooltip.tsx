// SPDX-License-Identifier: GPL-3.0-or-later
import { X, ArrowRight } from 'lucide-react';
import type { SiteChildWithStats } from '../../types';

interface Props {
  child: SiteChildWithStats;
  onClose: () => void;
  onDrillDown: (child: SiteChildWithStats) => void;
}

export default function SiteTooltip({ child, onClose, onDrillDown }: Props) {
  const { device_stats: stats } = child;

  return (
    <div
      className="absolute z-30 bg-white dark:bg-gray-800 rounded-lg shadow-xl border dark:border-gray-700 w-64 p-3"
      style={{
        left: `${child.map_x}%`,
        top: `${child.map_y}%`,
        transform: 'translate(-50%, 16px)',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold dark:text-white truncate pr-2">{child.name}</span>
        <button onClick={onClose} className="p-0.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
          <X className="h-3.5 w-3.5 text-gray-400" />
        </button>
      </div>

      {child.location && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{child.location}</p>
      )}

      <div className="space-y-1.5 text-xs mb-3">
        <div className="flex justify-between">
          <span className="text-gray-500 dark:text-gray-400">Total Devices</span>
          <span className="font-medium dark:text-gray-300">{stats.total}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500 dark:text-gray-400">Online</span>
          <span className="font-medium text-green-600">{stats.online}</span>
        </div>
        {stats.warning > 0 && (
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">Warning</span>
            <span className="font-medium text-yellow-600">{stats.warning}</span>
          </div>
        )}
        {stats.offline > 0 && (
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">Offline</span>
            <span className="font-medium text-red-600">{stats.offline}</span>
          </div>
        )}
      </div>

      <button
        onClick={() => onDrillDown(child)}
        className="w-full flex items-center justify-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 py-1.5 rounded border border-blue-200 dark:border-blue-800"
      >
        <ArrowRight className="h-3 w-3" /> Drill Down
      </button>
    </div>
  );
}
