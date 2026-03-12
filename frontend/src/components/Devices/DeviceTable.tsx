// SPDX-License-Identifier: GPL-3.0-or-later
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Pencil, Trash2 } from 'lucide-react';
import StatusBadge from '../Common/StatusBadge';
import ConfirmDialog from '../Common/ConfirmDialog';
import { useRole } from '../../hooks/useRole';
import api from '../../api/client';
import type { Device } from '../../types';
import { formatRelative } from '../../utils/date';

interface Props {
  devices: Device[];
  onEdit?: (device: Device) => void;
  onDelete?: () => void;
  selectedIds?: Set<number>;
  onSelectionChange?: (ids: Set<number>) => void;
}

export default function DeviceTable({ devices, onEdit, onDelete, selectedIds, onSelectionChange }: Props) {
  const { isAdmin } = useRole();
  const [deleteTarget, setDeleteTarget] = useState<Device | null>(null);
  const selectable = !!onSelectionChange;
  const selected = selectedIds || new Set<number>();

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/api/devices/${deleteTarget.id}`);
      setDeleteTarget(null);
      onDelete?.();
    } catch {
      setDeleteTarget(null);
    }
  };

  const toggleOne = (id: number) => {
    if (!onSelectionChange) return;
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange(next);
  };

  const toggleAll = () => {
    if (!onSelectionChange) return;
    if (selected.size === devices.length) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(devices.map(d => d.id)));
    }
  };

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs uppercase bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
            <tr>
              {selectable && (
                <th className="px-3 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={devices.length > 0 && selected.size === devices.length}
                    onChange={toggleAll}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </th>
              )}
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">IP Address</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Site</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Response</th>
              <th className="px-4 py-3">Last Seen</th>
              <th className="px-4 py-3">Uptime</th>
              <th className="px-4 py-3 w-24"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {devices.map((d) => (
              <tr key={d.id} className={`hover:bg-gray-50 dark:hover:bg-gray-800 ${selected.has(d.id) ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>
                {selectable && (
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(d.id)}
                      onChange={() => toggleOne(d.id)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </td>
                )}
                <td className="px-4 py-3">
                  <Link to={`/devices/${d.id}`} className="font-medium text-primary-600 hover:underline dark:text-primary-400">
                    {d.name}
                  </Link>
                </td>
                <td className="px-4 py-3 font-mono text-gray-600 dark:text-gray-300">{d.ip_address}</td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{d.device_type || '-'}</td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{d.site_name || '-'}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <StatusBadge status={d.status} />
                    {d.status_reason && d.status !== 'online' && (
                      <span className="text-xs text-gray-500 dark:text-gray-400">{d.status_reason}</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{d.response_time ? `${d.response_time.toFixed(1)}ms` : '-'}</td>
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">{d.last_seen ? formatRelative(d.last_seen) : 'Never'}</td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{d.uptime_percentage.toFixed(1)}%</td>
                <td className="px-4 py-3 flex gap-1">
                  {onEdit && (
                    <button
                      onClick={() => onEdit(d)}
                      className="p-1.5 text-gray-400 hover:text-blue-600 rounded hover:bg-blue-50 dark:hover:bg-blue-900/30"
                      title="Edit device"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
                  {isAdmin && (
                    <button
                      onClick={() => setDeleteTarget(d)}
                      className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-red-50 dark:hover:bg-red-900/30"
                      title="Delete device"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Device"
        message={`Are you sure you want to delete "${deleteTarget?.name}" (${deleteTarget?.ip_address})? This will remove all monitoring history for this device.`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}
