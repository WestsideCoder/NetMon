// SPDX-License-Identifier: GPL-3.0-or-later
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { parseUTC } from '../../utils/date';

interface DataPoint {
  timestamp: string;
  response_time: number | null;
}

export default function UptimeChart({ data }: { data: DataPoint[] }) {
  const chartData = data.map((d) => ({
    time: parseUTC(d.timestamp).toLocaleTimeString(),
    ms: d.response_time ?? 0,
  })).reverse();

  return (
    <ResponsiveContainer width="100%" height={250}>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="time" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} unit="ms" />
        <Tooltip />
        <Line type="monotone" dataKey="ms" stroke="#3b82f6" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
