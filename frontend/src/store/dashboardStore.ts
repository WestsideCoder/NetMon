// SPDX-License-Identifier: GPL-3.0-or-later
import { create } from 'zustand';

export interface DashboardWidget {
  id: string;
  visible: boolean;
}

const STORAGE_KEY = 'netmon-dashboard-widgets';

const DEFAULT_WIDGETS: DashboardWidget[] = [
  { id: 'status-cards', visible: true },
  { id: 'snmp-cards', visible: true },
  { id: 'map-widget', visible: true },
  { id: 'alerts', visible: true },
  { id: 'system-overview', visible: true },
  { id: 'offline-devices', visible: true },
  { id: 'device-list', visible: true },
];

interface DashboardState {
  widgets: DashboardWidget[];
  toggleWidget: (id: string) => void;
  reorderWidgets: (fromIndex: number, toIndex: number) => void;
  resetDefaults: () => void;
}

function loadWidgets(): DashboardWidget[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as DashboardWidget[];
      // Merge with defaults to handle new widgets added after user saved
      const knownIds = new Set(parsed.map((w) => w.id));
      const merged = [...parsed];
      for (const dw of DEFAULT_WIDGETS) {
        if (!knownIds.has(dw.id)) merged.push({ ...dw });
      }
      return merged;
    }
  } catch { /* ignore */ }
  return DEFAULT_WIDGETS.map((w) => ({ ...w }));
}

function persist(widgets: DashboardWidget[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets));
}

export const useDashboardStore = create<DashboardState>((set) => ({
  widgets: loadWidgets(),

  toggleWidget: (id) =>
    set((state) => {
      const widgets = state.widgets.map((w) =>
        w.id === id ? { ...w, visible: !w.visible } : w,
      );
      persist(widgets);
      return { widgets };
    }),

  reorderWidgets: (fromIndex, toIndex) =>
    set((state) => {
      const widgets = [...state.widgets];
      const [moved] = widgets.splice(fromIndex, 1);
      widgets.splice(toIndex, 0, moved);
      persist(widgets);
      return { widgets };
    }),

  resetDefaults: () => {
    const widgets = DEFAULT_WIDGETS.map((w) => ({ ...w }));
    persist(widgets);
    return set({ widgets });
  },
}));
