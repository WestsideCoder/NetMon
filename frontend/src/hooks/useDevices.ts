// SPDX-License-Identifier: GPL-3.0-or-later
import { useState, useEffect, useCallback } from 'react';
import api from '../api/client';
import type { Device, DeviceListResponse, DeviceStats } from '../types';

export function useDevices(page = 1, filters: Record<string, string> = {}) {
  const [data, setData] = useState<DeviceListResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), per_page: '50', ...filters });
      const res = await api.get(`/api/devices/?${params}`);
      setData(res.data);
    } catch (err) {
      console.error('Failed to load devices', err);
    } finally {
      setLoading(false);
    }
  }, [page, JSON.stringify(filters)]);

  useEffect(() => { load(); }, [load]);

  return { data, loading, reload: load };
}

export function useDeviceStats() {
  const [stats, setStats] = useState<DeviceStats | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/api/devices/stats');
      setStats(res.data);
    } catch (err) {
      console.error('Failed to load device stats', err);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { stats, reload: load };
}

export function useDevice(id: number) {
  const [device, setDevice] = useState<Device | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/api/devices/${id}`);
      setDevice(res.data);
    } catch {
      setDevice(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  return { device, loading, reload: load };
}
