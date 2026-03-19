// SPDX-License-Identifier: GPL-3.0-or-later
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import AlertList from '../components/Alerts/AlertList';
import api from '../api/client';
import type { Alert, Device } from '../types';
import { Wrench } from 'lucide-react';
import { formatRelative } from '../utils/date';

export default function Alerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [filter, setFilter] = useState<string>('');
  const [maintenanceDevices, setMaintenanceDevices] = useState<Device[]>([]);

  const load = async () => {
    const params = filter ? `?status=${filter}` : '';
    const res = await api.get(`/api/alerts/${params}`);
    setAlerts(res.data.items || res.data);
  };

  const loadMaintenance = async () => {
    try {
      const res = await api.get('/api/devices/maintenance');
      setMaintenanceDevices(res.data);
    } catch {
      setMaintenanceDevices([]);
    }
  };

  useEffect(() => { load(); }, [filter]);
  useEffect(() => { loadMaintenance(); }, []);

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

      {maintenanceDevices.length > 0 && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <Wrench className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <h2 className="text-sm font-semibold text-blue-800 dark:text-blue-300">
              Devices in Maintenance Mode ({maintenanceDevices.length})
            </h2>
            <span className="text-xs text-blue-600 dark:text-blue-400">— alerts suppressed</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
            {maintenanceDevices.map((d) => (
              <Link key={d.id} to={`/devices/${d.id}`}
                className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-800 rounded border border-blue-100 dark:border-blue-800 hover:border-blue-300 dark:hover:border-blue-600 transition-colors">
                <Wrench className="h-4 w-4 text-blue-500 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{d.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{d.ip_address}
                    {d.maintenance_until && <> &middot; until {formatRelative(d.maintenance_until)}</>}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
        <AlertList alerts={alerts} onUpdate={load} />
      </div>
    </div>
  );
}
