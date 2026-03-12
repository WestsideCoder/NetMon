// SPDX-License-Identifier: GPL-3.0-or-later
import { useState, useRef, useEffect } from 'react';
import { Settings2, GripVertical, RotateCcw } from 'lucide-react';
import { useDashboardStore } from '../../store/dashboardStore';

const WIDGET_LABELS: Record<string, string> = {
  'status-cards': 'Status Cards',
  'snmp-cards': 'SNMP Highlights',
  'map-widget': 'Site Maps',
  'alerts': 'Active Alerts',
  'system-overview': 'System Overview',
  'offline-devices': 'Offline Devices',
  'device-list': 'Devices',
};

export default function DashboardSettings() {
  const [open, setOpen] = useState(false);
  const { widgets, toggleWidget, reorderWidgets, resetDefaults } = useDashboardStore();
  const panelRef = useRef<HTMLDivElement>(null);
  const dragIndex = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const handleDragStart = (idx: number) => {
    dragIndex.current = idx;
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (targetIdx: number) => {
    if (dragIndex.current !== null && dragIndex.current !== targetIdx) {
      reorderWidgets(dragIndex.current, targetIdx);
    }
    dragIndex.current = null;
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(!open)}
        className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
        title="Dashboard settings"
      >
        <Settings2 className="h-5 w-5" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-white dark:bg-gray-800 rounded-lg shadow-lg border dark:border-gray-700 z-50">
          <div className="px-4 py-3 border-b dark:border-gray-700">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Dashboard Widgets</p>
            <p className="text-xs text-gray-500 mt-0.5">Toggle visibility and drag to reorder</p>
          </div>
          <div className="py-1">
            {widgets.map((w, idx) => (
              <div
                key={w.id}
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragOver={handleDragOver}
                onDrop={() => handleDrop(idx)}
                className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-grab active:cursor-grabbing"
              >
                <GripVertical className="h-4 w-4 text-gray-400 shrink-0" />
                <label className="flex items-center gap-2 flex-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={w.visible}
                    onChange={() => toggleWidget(w.id)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    {WIDGET_LABELS[w.id] || w.id}
                  </span>
                </label>
              </div>
            ))}
          </div>
          <div className="px-4 py-2 border-t dark:border-gray-700">
            <button
              onClick={() => { resetDefaults(); setOpen(false); }}
              className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              <RotateCcw className="h-3 w-3" />
              Reset to Default
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
