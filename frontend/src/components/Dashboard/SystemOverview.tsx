// SPDX-License-Identifier: GPL-3.0-or-later
import { Link } from 'react-router-dom';
import type { DeviceStats } from '../../types';

export default function SystemOverview({ stats }: { stats: DeviceStats | null }) {
  if (!stats) return null;
  const pct = (n: number) => stats.total > 0 ? (n / stats.total) * 100 : 0;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
      <div className="px-5 py-4 border-b dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">System Overview</h2>
      </div>
      <div className="p-5 space-y-4">
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-gray-600 dark:text-gray-400">Online</span>
            <Link to="/devices?status=online" className="font-medium text-green-600 hover:underline">{stats.online} / {stats.total}</Link>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3 dark:bg-gray-700">
            <div className="bg-green-500 h-3 rounded-full transition-all" style={{ width: `${pct(stats.online)}%` }} />
          </div>
        </div>
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-gray-600 dark:text-gray-400">Warning</span>
            <Link to="/devices?status=warning" className="font-medium text-yellow-600 hover:underline">{stats.warning}</Link>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3 dark:bg-gray-700">
            <div className="bg-yellow-500 h-3 rounded-full transition-all" style={{ width: `${pct(stats.warning)}%` }} />
          </div>
        </div>
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-gray-600 dark:text-gray-400">Offline</span>
            <Link to="/devices?status=offline" className="font-medium text-red-600 hover:underline">{stats.offline}</Link>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3 dark:bg-gray-700">
            <div className="bg-red-500 h-3 rounded-full transition-all" style={{ width: `${pct(stats.offline)}%` }} />
          </div>
        </div>
        <div className="pt-3 border-t dark:border-gray-700 grid grid-cols-2 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{pct(stats.online).toFixed(1)}%</p>
            <p className="text-xs text-gray-500">Availability</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.unknown}</p>
            <p className="text-xs text-gray-500">Unknown</p>
          </div>
        </div>
      </div>
    </div>
  );
}
