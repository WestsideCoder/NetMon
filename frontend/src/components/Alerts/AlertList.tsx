// SPDX-License-Identifier: GPL-3.0-or-later
import { Link } from 'react-router-dom';
import StatusBadge from '../Common/StatusBadge';
import api from '../../api/client';
import type { Alert } from '../../types';
import { formatRelative } from '../../utils/date';

interface Props {
  alerts: Alert[];
  onUpdate: () => void;
}

const statusOrder: Record<string, number> = { active: 0, acknowledged: 1, resolved: 2 };

export default function AlertList({ alerts, onUpdate }: Props) {
  const sorted = [...alerts].sort((a, b) => (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9));
  const handleAck = async (id: number) => {
    await api.post(`/api/alerts/${id}/ack`);
    onUpdate();
  };
  const handleResolve = async (id: number) => {
    await api.post(`/api/alerts/${id}/resolve`);
    onUpdate();
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead className="text-xs uppercase bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
          <tr>
            <th className="px-4 py-3">Severity</th>
            <th className="px-4 py-3">Device</th>
            <th className="px-4 py-3">Title</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Triggered</th>
            <th className="px-4 py-3">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
          {sorted.map((a) => (
            <tr key={a.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
              <td className="px-4 py-3"><StatusBadge status={a.severity} /></td>
              <td className="px-4 py-3"><Link to={`/devices/${a.device_id}`} className="text-primary-600 hover:underline dark:text-primary-400 whitespace-nowrap">{a.device_name || `Device #${a.device_id}`}</Link></td>
              <td className="px-4 py-3"><span className="font-medium">{a.title}</span></td>
              <td className="px-4 py-3"><StatusBadge status={a.status} /></td>
              <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">
                {formatRelative(a.triggered_at)}
              </td>
              <td className="px-4 py-3 flex gap-2">
                {a.status === 'active' && (
                  <button onClick={() => handleAck(a.id)} className="text-xs px-2 py-1 bg-yellow-100 text-yellow-800 rounded hover:bg-yellow-200">Ack</button>
                )}
                {a.status !== 'resolved' && (
                  <button onClick={() => handleResolve(a.id)} className="text-xs px-2 py-1 bg-green-100 text-green-800 rounded hover:bg-green-200">Resolve</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
