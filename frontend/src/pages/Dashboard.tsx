// SPDX-License-Identifier: GPL-3.0-or-later
import { useState, useEffect, useCallback, type ReactNode } from 'react';
import StatusCards from '../components/Dashboard/StatusCards';
import DashboardSNMPCards from '../components/Dashboard/DashboardSNMPCards';
import DashboardMapWidget from '../components/Dashboard/DashboardMapWidget';
import ActiveAlerts from '../components/Dashboard/ActiveAlerts';
import SystemOverview from '../components/Dashboard/SystemOverview';
import OfflineDevicesList from '../components/Dashboard/OfflineDevicesList';
import RecentDevicesList from '../components/Dashboard/RecentDevicesList';
import DashboardSettings from '../components/Dashboard/DashboardSettings';
import { useDashboardStore } from '../store/dashboardStore';
import { useDeviceStats } from '../hooks/useDevices';
import { useActiveAlerts } from '../hooks/useAlerts';
import { useWebSocket } from '../hooks/useWebSocket';
import api from '../api/client';
import type { Device } from '../types';

export default function Dashboard() {
  const { stats, reload: reloadStats } = useDeviceStats();
  const { alerts, reload: reloadAlerts } = useActiveAlerts();
  const [offlineDevices, setOfflineDevices] = useState<Device[]>([]);
  const [recentDevices, setRecentDevices] = useState<Device[]>([]);
  const [wsUpdateCounter, setWsUpdateCounter] = useState(0);
  const { widgets } = useDashboardStore();

  const loadDevices = useCallback(async () => {
    try {
      const [offRes, recentRes] = await Promise.all([
        api.get('/api/devices/?status=offline&per_page=5'),
        api.get('/api/devices/?per_page=10'),
      ]);
      setOfflineDevices(offRes.data.items);
      setRecentDevices(recentRes.data.items);
    } catch { /* ignore */ }
  }, []);

  const handleWsMessage = useCallback(() => {
    reloadStats();
    reloadAlerts();
    loadDevices();
    setWsUpdateCounter((c) => c + 1);
  }, [reloadStats, reloadAlerts, loadDevices]);

  useWebSocket(handleWsMessage);

  useEffect(() => { loadDevices(); }, [loadDevices]);

  useEffect(() => {
    const interval = setInterval(() => { reloadStats(); reloadAlerts(); loadDevices(); }, 30000);
    return () => clearInterval(interval);
  }, [reloadStats, reloadAlerts, loadDevices]);

  // Widget registry — maps id to render function
  const widgetRegistry: Record<string, () => ReactNode> = {
    'status-cards': () => <StatusCards stats={stats} />,
    'snmp-cards': () => <DashboardSNMPCards key={wsUpdateCounter} />,
    'map-widget': () => <DashboardMapWidget />,
    'alerts': () => <ActiveAlerts alerts={alerts} />,
    'system-overview': () => <SystemOverview stats={stats} />,
    'offline-devices': () => <OfflineDevicesList devices={offlineDevices} count={stats?.offline ?? 0} />,
    'device-list': () => <RecentDevicesList devices={recentDevices} />,
  };

  // Paired widgets that render side-by-side in a 2-col grid
  const pairs: [string, string][] = [
    ['alerts', 'system-overview'],
    ['offline-devices', 'device-list'],
  ];
  // Build render order, handling pairs
  const rendered = new Set<string>();
  const sections: ReactNode[] = [];

  for (const w of widgets) {
    if (!w.visible || rendered.has(w.id)) continue;

    // Check if this widget is part of a pair
    const pair = pairs.find(([a, b]) => a === w.id || b === w.id);
    if (pair) {
      const [a, b] = pair;
      const aWidget = widgets.find((ww) => ww.id === a);
      const bWidget = widgets.find((ww) => ww.id === b);
      const aVisible = aWidget?.visible ?? false;
      const bVisible = bWidget?.visible ?? false;

      if (aVisible && bVisible) {
        sections.push(
          <div key={`pair-${a}-${b}`} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {widgetRegistry[a]?.()}
            {widgetRegistry[b]?.()}
          </div>
        );
      } else if (aVisible) {
        sections.push(<div key={a}>{widgetRegistry[a]?.()}</div>);
      } else if (bVisible) {
        sections.push(<div key={b}>{widgetRegistry[b]?.()}</div>);
      }
      rendered.add(a);
      rendered.add(b);
    } else {
      sections.push(<div key={w.id}>{widgetRegistry[w.id]?.()}</div>);
      rendered.add(w.id);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
        <DashboardSettings />
      </div>
      {sections}
    </div>
  );
}
