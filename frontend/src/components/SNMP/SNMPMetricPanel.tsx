// SPDX-License-Identifier: GPL-3.0-or-later
import { useState, useCallback } from 'react';
import { BellOff, Bell } from 'lucide-react';
import UPSPanel from './UPSPanel';
import ServerPanel from './ServerPanel';
import NetworkPanel from './NetworkPanel';
import GenericPanel from './GenericPanel';
import { useRole } from '../../hooks/useRole';
import api from '../../api/client';
import type { SNMPDeviceData } from '../../types';

// Alertable metric names mapped to friendly labels
const ALERTABLE_METRICS: Record<string, string> = {
  cpuLoadAvg: 'CPU',
  cpuBusyPer5min: 'CPU (Cisco)',
  memoryUsedPercent: 'Memory',
  ciscoMemoryUsedPercent: 'Memory (Cisco)',
  diskUsedPercent: 'Disk',
  upsAdvBatteryCapacity: 'UPS Battery %',
  upsEstimatedChargeRemaining: 'UPS Battery %',
  upsBasicBatteryStatus: 'UPS Battery Status',
  upsBatteryStatus: 'UPS Battery Status',
  upsBasicOutputStatus: 'UPS Output Status',
  upsOutputSource: 'UPS Output Source',
  ciscoEnvMonTemperatureValue: 'Temperature',
  consecutive_failures: 'Ping Failures',
};

interface SNMPMetricPanelProps {
  data: SNMPDeviceData;
  deviceId?: number;
  excludedMetrics?: string | null;
  onExclusionsChange?: () => void;
}

export default function SNMPMetricPanel({ data, deviceId, excludedMetrics, onExclusionsChange }: SNMPMetricPanelProps) {
  const { canEdit } = useRole();
  const [excluded, setExcluded] = useState<Set<string>>(() => {
    try {
      return new Set(excludedMetrics ? JSON.parse(excludedMetrics) : []);
    } catch { return new Set(); }
  });
  const [saving, setSaving] = useState(false);

  // Find which alertable metrics this device actually has
  const deviceMetricNames = new Set(data.latest.map(m => m.oid_name));
  const applicableMetrics = Object.entries(ALERTABLE_METRICS).filter(
    ([key]) => deviceMetricNames.has(key)
  );

  const toggleMetric = useCallback(async (metricName: string) => {
    if (!deviceId) return;
    setSaving(true);
    const next = new Set(excluded);
    if (next.has(metricName)) {
      next.delete(metricName);
    } else {
      next.add(metricName);
    }
    setExcluded(next);
    try {
      await api.put(`/api/devices/${deviceId}`, {
        alert_excluded_metrics: JSON.stringify([...next]),
      });
      onExclusionsChange?.();
    } catch { /* ignore */ }
    setSaving(false);
  }, [deviceId, excluded, onExclusionsChange]);

  if (data.latest.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">SNMP Metrics</h3>
        <p className="text-sm text-gray-400">No SNMP data collected yet. Metrics will appear after the next poll cycle.</p>
      </div>
    );
  }

  let Panel;
  switch (data.device_type) {
    case 'ups':
      Panel = UPSPanel;
      break;
    case 'server':
      Panel = ServerPanel;
      break;
    case 'switch':
    case 'router':
      Panel = NetworkPanel;
      break;
    default:
      Panel = GenericPanel;
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">SNMP Metrics</h3>
        {data.template_name && (
          <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
            {data.template_name}
          </span>
        )}
      </div>

      {/* Alert exclusion toggles */}
      {canEdit && deviceId && applicableMetrics.length > 0 && (
        <div className="mb-4 pb-4 border-b dark:border-gray-700">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Alert Monitoring</p>
          <div className="flex flex-wrap gap-2">
            {applicableMetrics.map(([key, label]) => {
              const isExcluded = excluded.has(key);
              return (
                <button
                  key={key}
                  onClick={() => toggleMetric(key)}
                  disabled={saving}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full transition-colors disabled:opacity-50 ${
                    isExcluded
                      ? 'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500 line-through'
                      : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  }`}
                  title={isExcluded ? `Click to enable alerting on ${label}` : `Click to suppress alerting on ${label}`}
                >
                  {isExcluded ? <BellOff className="h-3 w-3" /> : <Bell className="h-3 w-3" />}
                  {label}
                </button>
              );
            })}
          </div>
          {excluded.size > 0 && (
            <p className="text-[10px] text-gray-400 mt-1.5">Crossed-out metrics will not trigger alerts for this device.</p>
          )}
        </div>
      )}

      <Panel data={data} />
    </div>
  );
}
