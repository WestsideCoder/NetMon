// SPDX-License-Identifier: GPL-3.0-or-later
import { useState, useEffect, useCallback } from 'react';
import api from '../api/client';
import type { Alert } from '../types';

export function useActiveAlerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/api/alerts/active');
      setAlerts(res.data);
    } catch (err) {
      console.error('Failed to load alerts', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { alerts, loading, reload: load };
}
