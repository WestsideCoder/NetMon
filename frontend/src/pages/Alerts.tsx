// SPDX-License-Identifier: GPL-3.0-or-later
import { useState, useEffect } from 'react';
import AlertList from '../components/Alerts/AlertList';
import api from '../api/client';
import type { Alert } from '../types';

export default function Alerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [filter, setFilter] = useState<string>('');

  const load = async () => {
    const params = filter ? `?status=${filter}` : '';
    const res = await api.get(`/api/alerts/${params}`);
    setAlerts(res.data.items || res.data);
  };

  useEffect(() => { load(); }, [filter]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Alerts</h1>
        <div className="flex gap-2">
          {['', 'active', 'acknowledged', 'resolved'].map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-sm rounded-lg ${filter === f ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'}`}>
              {f || 'All'}
            </button>
          ))}
        </div>
      </div>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
        <AlertList alerts={alerts} onUpdate={load} />
      </div>
    </div>
  );
}
