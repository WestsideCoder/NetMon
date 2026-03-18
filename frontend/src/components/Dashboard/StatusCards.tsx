// SPDX-License-Identifier: GPL-3.0-or-later
import { Link } from 'react-router-dom';
import { Monitor, CheckCircle, AlertTriangle, XCircle, Wrench } from 'lucide-react';
import type { DeviceStats } from '../../types';

export default function StatusCards({ stats }: { stats: DeviceStats | null }) {
  if (!stats) return null;
  const cards = [
    { label: 'Total', value: stats.total, icon: Monitor, color: 'bg-blue-500', link: '/devices' },
    { label: 'Online', value: stats.online, icon: CheckCircle, color: 'bg-green-500', link: '/devices?status=online' },
    { label: 'Warning', value: stats.warning, icon: AlertTriangle, color: 'bg-yellow-500', link: '/alerts' },
    { label: 'Offline', value: stats.offline, icon: XCircle, color: 'bg-red-500', link: '/alerts' },
    { label: 'Maintenance', value: stats.maintenance, icon: Wrench, color: 'bg-blue-400', link: '/devices' },
  ];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      {cards.map(({ label, value, icon: Icon, color, link }) => (
        <Link
          key={label}
          to={link}
          className="bg-white dark:bg-gray-800 rounded-lg shadow p-5 flex items-center gap-4 cursor-pointer hover:ring-2 hover:ring-blue-300 transition-all"
        >
          <div className={`${color} p-3 rounded-lg`}>
            <Icon className="h-6 w-6 text-white" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}
