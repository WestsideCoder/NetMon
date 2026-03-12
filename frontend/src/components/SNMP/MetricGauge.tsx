// SPDX-License-Identifier: GPL-3.0-or-later

interface MetricGaugeProps {
  label: string;
  value: number;
  max?: number;
  unit?: string;
  size?: number;
  /** When true, high values are good (green) — use for battery %. Default false (high = bad/red, e.g. CPU load). */
  highIsGood?: boolean;
}

function getColor(pct: number, highIsGood: boolean): string {
  if (highIsGood) {
    // Battery-style: 100% green, <=50% yellow, <=25% red
    if (pct > 50) return '#22c55e';
    if (pct > 25) return '#f59e0b';
    return '#ef4444';
  }
  // Load-style: low green, >=70% yellow, >=90% red
  if (pct >= 90) return '#ef4444';
  if (pct >= 70) return '#f59e0b';
  return '#22c55e';
}

export default function MetricGauge({ label, value, max = 100, unit = '%', size = 120, highIsGood = false }: MetricGaugeProps) {
  const pct = Math.min((value / max) * 100, 100);
  const color = getColor(pct, highIsGood);
  const r = (size - 16) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = Math.PI * r; // half circle
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size * 0.65} viewBox={`0 0 ${size} ${size * 0.65}`}>
        {/* Background arc */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke="currentColor"
          className="text-gray-200 dark:text-gray-700"
          strokeWidth={10}
          strokeLinecap="round"
        />
        {/* Value arc */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke={color}
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
        {/* Value text */}
        <text x={cx} y={cy - 4} textAnchor="middle" className="fill-gray-900 dark:fill-white" fontSize={size * 0.18} fontWeight="bold">
          {value}{unit}
        </text>
      </svg>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{label}</p>
    </div>
  );
}
