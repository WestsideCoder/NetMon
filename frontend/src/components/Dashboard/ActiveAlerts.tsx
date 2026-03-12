// SPDX-License-Identifier: GPL-3.0-or-later
import AlertFeed from './AlertFeed';
import type { Alert } from '../../types';

export default function ActiveAlerts({ alerts }: { alerts: Alert[] }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
      <div className="px-5 py-4 border-b dark:border-gray-700 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Active Alerts</h2>
        <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300">{alerts.length}</span>
      </div>
      <div className="p-5"><AlertFeed alerts={alerts} /></div>
    </div>
  );
}
