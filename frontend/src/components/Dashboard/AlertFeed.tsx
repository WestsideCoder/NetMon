// SPDX-License-Identifier: GPL-3.0-or-later
import { Link } from 'react-router-dom';
import StatusBadge from '../Common/StatusBadge';
import type { Alert } from '../../types';
import { formatRelative } from '../../utils/date';

export default function AlertFeed({ alerts }: { alerts: Alert[] }) {
  if (alerts.length === 0) {
    return <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">No active alerts</p>;
  }
  return (
    <div className="space-y-2">
      {alerts.slice(0, 10).map((alert) => (
        <div key={alert.id} className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
          <StatusBadge status={alert.severity} />
          <div className="flex-1 min-w-0">
            <Link to={`/devices/${alert.device_id}`} className="text-sm font-medium text-primary-600 hover:underline dark:text-primary-400 truncate block">{alert.title}</Link>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {formatRelative(alert.triggered_at)}
            </p>
          </div>
          <StatusBadge status={alert.status} />
        </div>
      ))}
    </div>
  );
}
