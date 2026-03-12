// SPDX-License-Identifier: GPL-3.0-or-later
import { useState, useEffect, useCallback } from 'react';
import api from '../api/client';
import { useWebSocket } from './useWebSocket';
import type { SNMPDeviceData } from '../types';

export function useDeviceSNMP(deviceId: number, hours = 24) {
  const [data, setData] = useState<SNMPDeviceData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/api/devices/${deviceId}/snmp?hours=${hours}`);
      setData(res.data);
    } catch {
      // device may not have SNMP data
    } finally {
      setLoading(false);
    }
  }, [deviceId, hours]);

  // Reload on WebSocket snmp_update
  const handleWs = useCallback((msg: unknown) => {
    if (msg && typeof msg === 'object' && (msg as Record<string, unknown>).type === 'snmp_update') {
      load();
    }
  }, [load]);

  useWebSocket(handleWs);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 60s
  useEffect(() => {
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, [load]);

  return { data, loading, reload: load };
}
