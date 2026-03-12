// SPDX-License-Identifier: GPL-3.0-or-later

interface MetricValueProps {
  label: string;
  value: string;
  unit?: string;
}

export default function MetricValue({ label, value, unit }: MetricValueProps) {
  return (
    <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-sm font-medium text-gray-900 dark:text-white mt-1">
        {value}{unit ? ` ${unit}` : ''}
      </p>
    </div>
  );
}
