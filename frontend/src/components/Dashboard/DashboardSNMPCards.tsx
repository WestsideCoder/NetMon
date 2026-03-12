// SPDX-License-Identifier: GPL-3.0-or-later
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Battery, Cpu, Server, Network, HardDrive, MemoryStick } from 'lucide-react';
import api from '../../api/client';
import type { SNMPSummaryDevice } from '../../types';

const METRIC_ICONS: Record<string, typeof Battery> = {
  upsAdvBatteryCapacity: Battery,
  upsEstimatedChargeRemaining: Battery,
  hrProcessorLoad: Cpu,
  cpuLoadAvg: Cpu,
  memoryUsedPercent: MemoryStick,
  diskUsedPercent: HardDrive,
  cpuBusyPer: Cpu,
  ifNumber: Network,
};

const TYPE_ICONS: Record<string, typeof Server> = {
  ups: Battery,
  server: Server,
  switch: Network,
  router: Network,
};

function metricColor(name: string | null, value: number): string {
  if (!name) return 'text-gray-500';
  // Battery: high = good
  if (name.includes('Battery') || name.includes('Charge')) {
    if (value > 50) return 'text-green-500';
    if (value > 25) return 'text-yellow-500';
    return 'text-red-500';
  }
  // CPU/Memory/Disk/Load: low = good
  if (value >= 90) return 'text-red-500';
  if (value >= 70) return 'text-yellow-500';
  return 'text-green-500';
}

export default function DashboardSNMPCards({ onUpdate }: { onUpdate?: () => void }) {
  const [devices, setDevices] = useState<SNMPSummaryDevice[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/api/devices/snmp-summary');
      setDevices(res.data.devices.filter((d: SNMPSummaryDevice) => d.key_metric_value !== null));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Reload when parent signals
  useEffect(() => {
    if (onUpdate) {
      load();
    }
  }, [onUpdate, load]);

  if (devices.length === 0) return null;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
      <div className="px-5 py-4 border-b dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">SNMP Highlights</h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4">
        {devices.map((d) => {
          const val = parseFloat(d.key_metric_value || '0');
          const Icon = (d.key_metric_name ? METRIC_ICONS[d.key_metric_name] : null) || TYPE_ICONS[d.device_type || ''] || Server;
          const color = metricColor(d.key_metric_name, val);

          return (
            <Link
              key={d.device_id}
              to={`/devices/${d.device_id}`}
              className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <div className={`p-2 rounded-lg bg-white dark:bg-gray-800 shadow-sm ${color}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{d.device_name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{d.device_type || 'device'}</p>
              </div>
              <div className="text-right">
                <p className={`text-lg font-bold ${color}`}>
                  {d.key_metric_type === 'gauge' ? `${val}%` : d.key_metric_value}
                </p>
                <p className="text-xs text-gray-400">{d.key_metric_name}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
