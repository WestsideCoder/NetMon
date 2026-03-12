// SPDX-License-Identifier: GPL-3.0-or-later
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { SNMPHistoryPoint } from '../../types';
import { parseUTC } from '../../utils/date';

interface MetricChartProps {
  title: string;
  data: SNMPHistoryPoint[];
  unit?: string;
  color?: string;
  maxY?: number;
}

export default function MetricChart({ title, data, unit = '', color = '#3b82f6', maxY }: MetricChartProps) {
  const chartData = data.map((d) => ({
    time: parseUTC(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    value: parseFloat(d.value) || 0,
  }));

  if (chartData.length === 0) return null;

  return (
    <div>
      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{title}</h4>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="time" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} unit={unit} domain={maxY != null ? [0, maxY] : undefined} />
          <Tooltip formatter={(v: number) => [`${v}${unit}`, title]} />
          <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
