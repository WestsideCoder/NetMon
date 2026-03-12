// SPDX-License-Identifier: GPL-3.0-or-later
import { Link } from 'react-router-dom';
import type { Device } from '../../types';
import { formatDate } from '../../utils/date';

export default function OfflineDevicesList({ devices, count }: { devices: Device[]; count: number }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
      <div className="px-5 py-4 border-b dark:border-gray-700 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Offline Devices</h2>
        {count > 0 && (
          <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300">{count}</span>
        )}
      </div>
      <div className="divide-y dark:divide-gray-700">
        {devices.length === 0 ? (
          <p className="px-5 py-6 text-sm text-gray-400 text-center">All devices are online</p>
        ) : devices.map((d) => (
          <div key={d.id} className="px-5 py-3 flex items-center justify-between">
            <div>
              <Link to={`/devices/${d.id}`} className="text-sm font-medium text-primary-600 hover:underline dark:text-primary-400">{d.name}</Link>
              <p className="text-xs text-gray-500 font-mono">{d.ip_address}</p>
            </div>
            <div className="text-right">
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300">offline</span>
              {d.last_seen && <p className="text-xs text-gray-400 mt-0.5">Last: {formatDate(d.last_seen)}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
