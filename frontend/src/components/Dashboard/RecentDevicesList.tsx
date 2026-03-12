// SPDX-License-Identifier: GPL-3.0-or-later
import { Link } from 'react-router-dom';
import type { Device } from '../../types';

export default function RecentDevicesList({ devices }: { devices: Device[] }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
      <div className="px-5 py-4 border-b dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Devices</h2>
      </div>
      <div className="divide-y dark:divide-gray-700">
        {devices.length === 0 ? (
          <p className="px-5 py-6 text-sm text-gray-400 text-center">No devices configured</p>
        ) : devices.map((d) => (
          <div key={d.id} className="px-5 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-2.5 h-2.5 rounded-full ${d.status === 'online' ? 'bg-green-500' : d.status === 'warning' ? 'bg-yellow-500' : d.status === 'offline' ? 'bg-red-500' : 'bg-gray-400'}`} />
              <div>
                <Link to={`/devices/${d.id}`} className="text-sm font-medium text-primary-600 hover:underline dark:text-primary-400">{d.name}</Link>
                <p className="text-xs text-gray-500 font-mono">{d.ip_address}</p>
              </div>
            </div>
            <div className="text-right text-xs text-gray-500">
              {d.response_time ? `${d.response_time.toFixed(1)}ms` : '-'}
              {d.device_type && <p>{d.device_type}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
