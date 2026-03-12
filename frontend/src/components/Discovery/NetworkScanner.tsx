// SPDX-License-Identifier: GPL-3.0-or-later
import { useState, useEffect, useRef, useCallback } from 'react';
import { Search } from 'lucide-react';
import { useRole } from '../../hooks/useRole';
import api from '../../api/client';
import type { SNMPCredential, Site } from '../../types';

interface DiscoveredDevice {
  ip_address: string;
  hostname: string | null;
  is_alive: boolean;
  response_time: number | null;
  snmp_sys_name: string | null;
  snmp_sys_descr: string | null;
  detected_type: string | null;
  snmp_credential_id: number | null;
}

interface ScanResult {
  scan_id: string;
  status: string;
  total_ips: number;
  scanned: number;
  alive: number;
  snmp_total: number;
  snmp_tested: number;
  devices: DiscoveredDevice[];
}

export default function NetworkScanner() {
  const { canEdit } = useRole();
  const [range, setRange] = useState('');
  const [siteId, setSiteId] = useState<number>(0);
  const [sites, setSites] = useState<Site[]>([]);
  const [testSnmp, setTestSnmp] = useState(true);
  const [selectedCreds, setSelectedCreds] = useState<number[]>([]);
  const [credentials, setCredentials] = useState<SNMPCredential[]>([]);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    api.get('/api/snmp/credentials').then((r) => setCredentials(r.data)).catch(() => {});
    api.get('/api/sites/').then((r) => {
      setSites(r.data);
      if (r.data.length > 0) setSiteId(r.data[0].id);
    }).catch(() => {});
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const pollProgress = useCallback((scanId: string) => {
    pollRef.current = setInterval(async () => {
      try {
        const res = await api.get(`/api/scanner/results/${scanId}`);
        const data: ScanResult = res.data;
        setResult(data);
        if (data.status === 'completed' || data.status === 'failed') {
          stopPolling();
          setScanning(false);
          if (data.status === 'completed') {
            setSelected(new Set(data.devices.map((d) => d.ip_address)));
          }
        }
      } catch {
        stopPolling();
        setScanning(false);
      }
    }, 500);
  }, [stopPolling]);

  const handleScan = async () => {
    setScanning(true);
    setResult(null);
    setSelected(new Set());
    stopPolling();
    try {
      const res = await api.post('/api/scanner/scan', {
        range,
        site_id: siteId,
        test_snmp: testSnmp,
        credential_ids: selectedCreds,
      });
      setResult(res.data);
      if (res.data.status === 'completed' || res.data.status === 'failed') {
        setScanning(false);
        setSelected(new Set(res.data.devices.map((d: DiscoveredDevice) => d.ip_address)));
      } else {
        pollProgress(res.data.scan_id);
      }
    } catch (err) {
      console.error('Scan failed', err);
      setScanning(false);
    }
  };

  const toggleSelect = (ip: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(ip)) next.delete(ip); else next.add(ip);
      return next;
    });
  };

  const toggleAll = () => {
    if (!result) return;
    if (selected.size === result.devices.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(result.devices.map((d) => d.ip_address)));
    }
  };

  const toggleCred = (id: number) => {
    setSelectedCreds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const handleImport = async () => {
    if (!result || selected.size === 0) return;
    try {
      const res = await api.post('/api/scanner/import', {
        scan_id: result.scan_id,
        site_id: siteId,
        devices: Array.from(selected),
      });
      alert(`Imported ${res.data.imported} devices`);
    } catch (err) {
      console.error('Import failed', err);
    }
  };

  // Progress calculations
  const isRunning = scanning && result != null;
  const isPinging = result?.status === 'pinging';
  const isSnmpTesting = result?.status === 'snmp_testing';
  const isComplete = result?.status === 'completed';

  let progressPercent = 0;
  let progressLabel = '';
  if (result) {
    if (isPinging) {
      progressPercent = result.total_ips > 0
        ? Math.round((result.scanned / result.total_ips) * 100)
        : 0;
      progressLabel = `Pinging ${result.scanned} / ${result.total_ips} IPs...`;
    } else if (isSnmpTesting) {
      progressPercent = result.snmp_total > 0
        ? Math.round((result.snmp_tested / result.snmp_total) * 100)
        : 0;
      progressLabel = `Testing SNMP on ${result.snmp_tested} / ${result.snmp_total} hosts...`;
    } else if (isComplete) {
      progressPercent = 100;
      progressLabel = 'Scan complete';
    } else if (result.status === 'failed') {
      progressLabel = 'Scan failed';
    }
  }

  const snmpDevices = result?.devices.filter((d) => d.snmp_credential_id) || [];
  const inputClass = 'border rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white';

  return (
    <div className="space-y-4">
      {/* Scanner controls */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 space-y-4">
        <h3 className="text-lg font-semibold dark:text-white">Network Scanner</h3>

        <div className="flex gap-3">
          <input
            value={range}
            onChange={(e) => setRange(e.target.value)}
            placeholder="192.168.1.0/24 or 192.168.1.1-254"
            className={`flex-1 ${inputClass}`}
            disabled={scanning}
          />
          <select
            value={siteId}
            onChange={(e) => setSiteId(Number(e.target.value))}
            className={`w-48 ${inputClass}`}
            disabled={scanning}
          >
            {sites.length === 0 && <option value={0}>No sites available</option>}
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}{s.location ? ` (${s.location})` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* SNMP testing options */}
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm dark:text-gray-300">
            <input
              type="checkbox"
              checked={testSnmp}
              onChange={(e) => setTestSnmp(e.target.checked)}
              className="rounded"
              disabled={scanning}
            />
            Test SNMP credentials on discovered devices
          </label>

          {testSnmp && credentials.length > 0 && (
            <div className="ml-6 space-y-1">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                Select credentials to test (leave all unchecked to try all active credentials):
              </p>
              {credentials.filter((c) => c.enabled).map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={selectedCreds.includes(c.id)}
                    onChange={() => toggleCred(c.id)}
                    className="rounded"
                    disabled={scanning}
                  />
                  {c.name} <span className="text-xs text-gray-400">({c.version.toUpperCase()})</span>
                </label>
              ))}
            </div>
          )}

          {testSnmp && credentials.length === 0 && (
            <p className="ml-6 text-xs text-amber-600 dark:text-amber-400">
              No SNMP credentials configured. Add credentials in SNMP Settings first.
            </p>
          )}
        </div>

        {canEdit && (
          <button
            onClick={handleScan}
            disabled={scanning || !range || !siteId}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            <Search className="h-4 w-4" />
            {scanning ? 'Scanning...' : 'Scan'}
          </button>
        )}
      </div>

      {/* Progress bar */}
      {isRunning && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-700 dark:text-gray-300">{progressLabel}</span>
            <span className="font-mono text-gray-500 dark:text-gray-400">{progressPercent}%</span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${isSnmpTesting ? 'bg-amber-500' : 'bg-blue-600'}`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="flex gap-4 text-xs text-gray-500 dark:text-gray-400">
            <span>{result?.alive ?? 0} alive</span>
            {testSnmp && isSnmpTesting && (
              <span>{snmpDevices.length} SNMP responding</span>
            )}
          </div>
        </div>
      )}

      {/* Results */}
      {result && isComplete && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
          <div className="px-4 py-3 border-b dark:border-gray-700 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold dark:text-white">
                Found {result.alive} alive out of {result.total_ips} IPs
              </h3>
              {testSnmp && (
                <p className="text-xs text-gray-500 mt-0.5">
                  {snmpDevices.length} device{snmpDevices.length !== 1 ? 's' : ''} responded to SNMP
                </p>
              )}
            </div>
            {canEdit && (
              <div className="flex items-center gap-2">
                <button
                  onClick={toggleAll}
                  className="text-xs px-3 py-1 border rounded hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  {selected.size === result.devices.length ? 'Deselect All' : 'Select All'}
                </button>
                <button
                  onClick={handleImport}
                  disabled={selected.size === 0}
                  className="text-sm px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                >
                  Import {selected.size} Device{selected.size !== 1 ? 's' : ''}
                </button>
              </div>
            )}
          </div>

          {/* Table header */}
          <div className="grid grid-cols-12 gap-2 px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 border-b dark:border-gray-700">
            <div className="col-span-1"></div>
            <div className="col-span-2">IP Address</div>
            <div className="col-span-1">Ping</div>
            <div className="col-span-2">SNMP Name</div>
            <div className="col-span-4">SNMP Description</div>
            <div className="col-span-2">Type</div>
          </div>

          {/* Device rows */}
          <div className="divide-y dark:divide-gray-700">
            {result.devices.map((d) => (
              <div
                key={d.ip_address}
                className={`grid grid-cols-12 gap-2 px-4 py-2.5 text-sm items-center cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 ${selected.has(d.ip_address) ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
                onClick={() => toggleSelect(d.ip_address)}
              >
                <div className="col-span-1">
                  {canEdit && (
                    <input
                      type="checkbox"
                      checked={selected.has(d.ip_address)}
                      onChange={() => toggleSelect(d.ip_address)}
                      className="rounded"
                    />
                  )}
                </div>
                <div className="col-span-2 font-mono dark:text-gray-300">{d.ip_address}</div>
                <div className="col-span-1 text-gray-500 dark:text-gray-400">
                  {d.response_time ? `${d.response_time.toFixed(1)}ms` : '-'}
                </div>
                <div className="col-span-2 dark:text-gray-300 truncate">
                  {d.snmp_sys_name || <span className="text-gray-400">-</span>}
                </div>
                <div className="col-span-4 text-xs text-gray-500 dark:text-gray-400 truncate">
                  {d.snmp_sys_descr || <span className="text-gray-400">-</span>}
                </div>
                <div className="col-span-2">
                  {d.detected_type ? (
                    <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300">
                      {d.detected_type}
                    </span>
                  ) : (
                    <span className="text-gray-400 text-xs">-</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
