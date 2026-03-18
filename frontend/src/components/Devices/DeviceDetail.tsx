// SPDX-License-Identifier: GPL-3.0-or-later
import { useState } from 'react';
import { Pencil, Play, Check, X, Loader2, Wrench } from 'lucide-react';
import StatusBadge from '../Common/StatusBadge';
import type { Device } from '../../types';
import { formatRelative } from '../../utils/date';
import { useRole } from '../../hooks/useRole';
import api from '../../api/client';

interface TestResults {
  ping: { alive: boolean; rtt: number | null; error?: string } | null;
  snmp: { success: boolean; error?: string } | null;
  http: { success: boolean; response_time?: number; error?: string } | null;
  ntp: { success: boolean; rtt?: number; server_time?: string; offset?: number; error?: string } | null;
  web: { success: boolean; http_status: number | null; https_status: number | null; http_time: number | null; https_time: number | null } | null;
}

interface Props {
  device: Device;
  onEdit?: () => void;
  onReload?: () => void;
}

export default function DeviceDetail({ device, onEdit, onReload }: Props) {
  const { canEdit } = useRole();
  const [testing, setTesting] = useState(false);
  const [testResults, setTestResults] = useState<TestResults | null>(null);
  const [maintenanceMode, setMaintenanceMode] = useState(device.maintenance_mode);
  const [togglingMaint, setTogglingMaint] = useState(false);

  const toggleMaintenance = async () => {
    setTogglingMaint(true);
    try {
      await api.put(`/api/devices/${device.id}`, { maintenance_mode: !maintenanceMode });
      setMaintenanceMode(!maintenanceMode);
      onReload?.();
    } catch { /* ignore */ }
    setTogglingMaint(false);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResults(null);
    try {
      const res = await api.post(`/api/devices/${device.id}/test`);
      setTestResults(res.data);
      onReload?.();
    } catch {
      setTestResults({ ping: { alive: false, rtt: null, error: 'Request failed' }, snmp: null, http: null, ntp: null, web: null });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{device.name}</h2>
          <p className="text-sm font-mono text-gray-500 dark:text-gray-400">{device.ip_address}</p>
          {device.site_name && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{device.site_name}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {canEdit && (
            <button
              onClick={toggleMaintenance}
              disabled={togglingMaint}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg disabled:opacity-50 ${
                maintenanceMode
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <Wrench className="h-4 w-4" />
              {maintenanceMode ? 'In Maintenance' : 'Maintenance'}
            </button>
          )}
          {canEdit && (
            <button
              onClick={handleTest}
              disabled={testing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {testing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              {testing ? 'Testing...' : 'Test Now'}
            </button>
          )}
          {canEdit && onEdit && (
            <button onClick={onEdit} className="flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">
              <Pencil className="h-4 w-4" /> Edit
            </button>
          )}
          <StatusBadge status={device.status} />
          {maintenanceMode && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
              <Wrench className="h-3 w-3" /> Maintenance
            </span>
          )}
          {device.status_reason && device.status !== 'online' && !maintenanceMode && (
            <span className="text-xs text-gray-500 dark:text-gray-400">{device.status_reason}</span>
          )}
        </div>
      </div>

      {/* Test results banner */}
      {testResults && (
        <div className="mb-6 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Test Results</p>
            <button onClick={() => setTestResults(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex flex-wrap gap-4">
            {/* Ping result */}
            {testResults.ping && (
              <div className="flex items-center gap-2">
                {testResults.ping.alive ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <X className="h-4 w-4 text-red-500" />
                )}
                <span className="text-sm dark:text-gray-300">
                  Ping: {testResults.ping.alive
                    ? `${testResults.ping.rtt != null ? testResults.ping.rtt.toFixed(1) + 'ms' : 'alive'}`
                    : testResults.ping.error || 'no response'}
                </span>
              </div>
            )}
            {/* SNMP result */}
            {testResults.snmp && (
              <div className="flex items-center gap-2">
                {testResults.snmp.success ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <X className="h-4 w-4 text-red-500" />
                )}
                <span className="text-sm dark:text-gray-300">
                  SNMP: {testResults.snmp.success ? 'polled OK' : testResults.snmp.error || 'failed'}
                </span>
              </div>
            )}
            {!testResults.snmp && device.snmp_enabled && (
              <div className="flex items-center gap-2">
                <span className="h-4 w-4 text-gray-400">-</span>
                <span className="text-sm text-gray-400">SNMP: skipped (no credential)</span>
              </div>
            )}
            {/* HTTP result */}
            {testResults.http && (
              <div className="flex items-center gap-2">
                {testResults.http.success ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <X className="h-4 w-4 text-red-500" />
                )}
                <span className="text-sm dark:text-gray-300">
                  HTTP URL: {testResults.http.success
                    ? `${testResults.http.response_time != null ? testResults.http.response_time.toFixed(0) + 'ms' : 'OK'}`
                    : testResults.http.error || 'failed'}
                </span>
              </div>
            )}
            {/* NTP result */}
            {testResults.ntp && (
              <div className="flex items-center gap-2">
                {testResults.ntp.success ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <X className="h-4 w-4 text-red-500" />
                )}
                <span className="text-sm dark:text-gray-300">
                  NTP: {testResults.ntp.success
                    ? `Stratum ${(testResults.ntp as any).stratum}${(testResults.ntp as any).reference_id ? ' (' + (testResults.ntp as any).reference_id + ')' : ''}, ${testResults.ntp.rtt}ms RTT, offset ${testResults.ntp.offset != null ? (testResults.ntp.offset > 0 ? '+' : '') + testResults.ntp.offset + 'ms' : 'N/A'}`
                    : testResults.ntp.error || 'no response'}
                </span>
              </div>
            )}
            {/* Web probe result */}
            {testResults.web && (
              <div className="flex items-center gap-2">
                {testResults.web.success ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <X className="h-4 w-4 text-red-500" />
                )}
                <span className="text-sm dark:text-gray-300">
                  Web: {testResults.web.success ? (
                    [
                      testResults.web.https_status != null && `HTTPS ${testResults.web.https_status} (${testResults.web.https_time}ms)`,
                      testResults.web.http_status != null && `HTTP ${testResults.web.http_status} (${testResults.web.http_time}ms)`,
                    ].filter(Boolean).join(', ')
                  ) : 'no web server'}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Type', value: (device.device_type || 'N/A') + (device.os_info ? ` (${device.os_info})` : '') },
          { label: 'Response Time', value: device.response_time ? `${device.response_time.toFixed(1)}ms` : 'N/A' },
          { label: 'Uptime', value: `${device.uptime_percentage.toFixed(2)}%` },
          { label: 'Last Seen', value: device.last_seen ? formatRelative(device.last_seen) : 'Never' },
          { label: 'Total Checks', value: String(device.total_checks) },
          { label: 'Failures', value: String(device.consecutive_failures) },
          { label: 'SNMP', value: device.snmp_enabled ? 'Enabled' : 'Disabled' },
          { label: 'Maintenance', value: device.maintenance_mode ? 'Active' : 'Off' },
        ].map(({ label, value }) => (
          <div key={label} className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
            <p className="text-sm font-medium text-gray-900 dark:text-white mt-1">{value}</p>
          </div>
        ))}
      </div>

      {/* NTP Info */}
      {device.ntp_enabled && (
        <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">NTP Status</p>
          {device.ntp_offset_ms != null ? (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Stratum</p>
                <p className={`text-sm font-medium mt-1 ${device.ntp_stratum === 1 ? 'text-green-600 dark:text-green-400' : device.ntp_stratum != null && device.ntp_stratum >= 16 ? 'text-red-600 dark:text-red-400' : 'text-yellow-600 dark:text-yellow-400'}`}>
                  {device.ntp_stratum ?? 'N/A'}
                  {device.ntp_reference_id && (
                    <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">({device.ntp_reference_id})</span>
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Clock Offset</p>
                <p className={`text-sm font-medium mt-1 ${Math.abs(device.ntp_offset_ms) > 100 ? 'text-red-600 dark:text-red-400' : Math.abs(device.ntp_offset_ms) > 10 ? 'text-yellow-600 dark:text-yellow-400' : 'text-green-600 dark:text-green-400'}`}>
                  {device.ntp_offset_ms > 0 ? '+' : ''}{device.ntp_offset_ms}ms
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">RTT</p>
                <p className="text-sm font-medium text-gray-900 dark:text-white mt-1">{device.ntp_rtt_ms}ms</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Device Time (UTC)</p>
                <p className="text-sm font-medium text-gray-900 dark:text-white mt-1">
                  {device.ntp_server_time ? new Date(device.ntp_server_time).toLocaleString() : 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Reference</p>
                <p className="text-sm font-medium text-gray-900 dark:text-white mt-1">
                  {device.ntp_reference_id || 'N/A'}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400">No NTP data yet — click Test Now to probe</p>
          )}
        </div>
      )}

      {device.notes && (
        <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
          <p className="text-xs text-gray-500 dark:text-gray-400">Notes</p>
          <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{device.notes}</p>
        </div>
      )}
    </div>
  );
}
