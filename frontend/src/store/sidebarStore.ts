// SPDX-License-Identifier: GPL-3.0-or-later
import { create } from 'zustand';

interface SidebarState {
  collapsed: boolean;
  toggle: () => void;
}

export const useSidebarStore = create<SidebarState>((set) => ({
  collapsed: localStorage.getItem('netmon-sidebar-collapsed') === 'true',
  toggle: () =>
    set((state) => {
      const next = !state.collapsed;
      localStorage.setItem('netmon-sidebar-collapsed', String(next));
      return { collapsed: next };
    }),
}));
