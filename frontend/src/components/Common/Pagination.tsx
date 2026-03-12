// SPDX-License-Identifier: GPL-3.0-or-later

interface Props {
  page: number;
  total: number;
  perPage: number;
  onPageChange: (page: number) => void;
}

export default function Pagination({ page, total, perPage, onPageChange }: Props) {
  const totalPages = Math.ceil(total / perPage);
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700">
      <p className="text-sm text-gray-700 dark:text-gray-300">
        Showing {(page - 1) * perPage + 1} to {Math.min(page * perPage, total)} of {total}
      </p>
      <div className="flex gap-1">
        <button onClick={() => onPageChange(page - 1)} disabled={page <= 1}
          className="px-3 py-1 text-sm border rounded disabled:opacity-50 hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700">
          Prev
        </button>
        <button onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}
          className="px-3 py-1 text-sm border rounded disabled:opacity-50 hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700">
          Next
        </button>
      </div>
    </div>
  );
}
