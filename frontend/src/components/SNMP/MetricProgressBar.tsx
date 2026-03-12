// SPDX-License-Identifier: GPL-3.0-or-later

interface MetricProgressBarProps {
  label: string;
  value: number;
  max?: number;
  unit?: string;
}

export default function MetricProgressBar({ label, value, max = 100, unit = '%' }: MetricProgressBarProps) {
  const pct = Math.min((value / max) * 100, 100);
  const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-yellow-500' : 'bg-green-500';

  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-600 dark:text-gray-400">{label}</span>
        <span className="font-medium text-gray-900 dark:text-white">{value}{unit}</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
        <div
          className={`${color} h-2.5 rounded-full transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
