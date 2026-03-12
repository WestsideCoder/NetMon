// SPDX-License-Identifier: GPL-3.0-or-later
import MetricChart from './MetricChart';
import type { SNMPDeviceData } from '../../types';
import { parseUTC } from '../../utils/date';

export default function GenericPanel({ data }: { data: SNMPDeviceData }) {
  const gaugeMetrics = data.latest.filter((m) => m.value_type === 'gauge');

  return (
    <div className="space-y-4">
      {/* Key-value table for all latest metrics */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b dark:border-gray-700">
              <th className="text-left py-2 text-gray-500 dark:text-gray-400 font-medium">Metric</th>
              <th className="text-left py-2 text-gray-500 dark:text-gray-400 font-medium">Value</th>
              <th className="text-left py-2 text-gray-500 dark:text-gray-400 font-medium">Type</th>
              <th className="text-left py-2 text-gray-500 dark:text-gray-400 font-medium">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y dark:divide-gray-700">
            {data.latest.map((m) => (
              <tr key={m.oid_name}>
                <td className="py-2 text-gray-900 dark:text-white font-mono text-xs">{m.oid_name}</td>
                <td className="py-2 text-gray-900 dark:text-white">{m.value}</td>
                <td className="py-2 text-gray-500 dark:text-gray-400">{m.value_type}</td>
                <td className="py-2 text-gray-400 text-xs">{parseUTC(m.timestamp).toLocaleTimeString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Charts for gauge-type values */}
      {gaugeMetrics.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {gaugeMetrics.slice(0, 4).map((m) => (
            data.history[m.oid_name] ? (
              <MetricChart key={m.oid_name} title={m.oid_name} data={data.history[m.oid_name]} />
            ) : null
          ))}
        </div>
      )}
    </div>
  );
}
