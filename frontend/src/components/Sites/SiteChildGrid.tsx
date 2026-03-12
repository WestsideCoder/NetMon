// SPDX-License-Identifier: GPL-3.0-or-later
import { Building2, Layers, MapPin } from 'lucide-react';
import type { SiteChildWithStats } from '../../types';

const LEVEL_ICONS: Record<number, typeof Building2> = {
  2: Building2,
  3: Building2,
  4: Layers,
};

interface Props {
  children: SiteChildWithStats[];
  onSelect: (child: SiteChildWithStats) => void;
  loading: boolean;
}

function StatusBar({ stats }: { stats: SiteChildWithStats['device_stats'] }) {
  if (stats.total === 0) return <div className="h-1.5 rounded-full bg-gray-200 dark:bg-gray-700" />;

  const segments = [
    { count: stats.online, color: 'bg-green-500' },
    { count: stats.warning, color: 'bg-yellow-500' },
    { count: stats.offline, color: 'bg-red-500' },
    { count: stats.unknown, color: 'bg-gray-400' },
  ].filter(s => s.count > 0);

  return (
    <div className="flex h-1.5 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700">
      {segments.map((seg, i) => (
        <div
          key={i}
          className={seg.color}
          style={{ width: `${(seg.count / stats.total) * 100}%` }}
        />
      ))}
    </div>
  );
}

export default function SiteChildGrid({ children, onSelect, loading }: Props) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 animate-pulse">
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-3" />
            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mb-4" />
            <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (children.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
        <Layers className="h-10 w-10 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-400">No child sites</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {children.map(child => {
        const Icon = LEVEL_ICONS[child.level] || MapPin;
        return (
          <button
            key={child.id}
            onClick={() => onSelect(child)}
            className="bg-white dark:bg-gray-800 rounded-lg shadow hover:shadow-md transition-shadow p-4 text-left group"
          >
            <div className="flex items-start gap-3 mb-3">
              {child.map_image_url ? (
                <div className="w-10 h-10 rounded bg-gray-100 dark:bg-gray-700 overflow-hidden shrink-0">
                  <img src={child.map_image_url} alt="" className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="w-10 h-10 rounded bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0">
                  <Icon className="h-5 w-5 text-gray-400" />
                </div>
              )}
              <div className="min-w-0">
                <h4 className="text-sm font-semibold dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  {child.name}
                </h4>
                {child.location && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{child.location}</p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-2">
              <span>{child.device_stats.total} device{child.device_stats.total !== 1 ? 's' : ''}</span>
              {child.device_stats.total > 0 && (
                <span>
                  <span className="text-green-600">{child.device_stats.online}</span>
                  {child.device_stats.warning > 0 && <> / <span className="text-yellow-600">{child.device_stats.warning}</span></>}
                  {child.device_stats.offline > 0 && <> / <span className="text-red-600">{child.device_stats.offline}</span></>}
                </span>
              )}
            </div>

            <StatusBar stats={child.device_stats} />
          </button>
        );
      })}
    </div>
  );
}
