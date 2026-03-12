// SPDX-License-Identifier: GPL-3.0-or-later
import { ChevronRight } from 'lucide-react';
import type { Site } from '../../types';

const LEVEL_LABELS: Record<number, string> = {
  1: 'District',
  2: 'Site',
  3: 'Building',
  4: 'Floor',
};

interface Props {
  navStack: Site[];
  onNavigate: (index: number) => void;
}

export default function SiteBreadcrumb({ navStack, onNavigate }: Props) {
  if (navStack.length === 0) return null;

  return (
    <nav className="flex items-center gap-1 text-sm overflow-x-auto pb-1">
      {navStack.map((site, i) => {
        const isLast = i === navStack.length - 1;
        return (
          <span key={site.id} className="flex items-center gap-1 shrink-0">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
            {isLast ? (
              <span className="font-medium text-gray-900 dark:text-white">
                {site.name}
                <span className="text-xs text-gray-400 ml-1">({LEVEL_LABELS[site.level] || `L${site.level}`})</span>
              </span>
            ) : (
              <button
                onClick={() => onNavigate(i)}
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                {site.name}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}
