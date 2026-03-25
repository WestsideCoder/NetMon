// SPDX-License-Identifier: GPL-3.0-or-later
import { clsx } from 'clsx';

const colors: Record<string, string> = {
  online: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  offline: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  maintenance: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  unknown: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
  active: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  acknowledged: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  resolved: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  info: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  critical: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span className={clsx('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', colors[status] || colors.unknown)}>
      {status}
    </span>
  );
}
