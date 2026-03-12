// SPDX-License-Identifier: GPL-3.0-or-later
import { Building2 } from 'lucide-react';
import type { SiteChildWithStats } from '../../types';

function getStatusColor(stats: SiteChildWithStats['device_stats']) {
  if (stats.offline > 0) return { bg: 'bg-red-500', ring: 'ring-red-300' };
  if (stats.warning > 0) return { bg: 'bg-yellow-500', ring: 'ring-yellow-300' };
  if (stats.online > 0) return { bg: 'bg-green-500', ring: 'ring-green-300' };
  return { bg: 'bg-gray-400', ring: 'ring-gray-300' };
}

interface Props {
  child: SiteChildWithStats;
  isEditMode: boolean;
  isSelected: boolean;
  onClick: (child: SiteChildWithStats) => void;
  onDragStart?: (e: React.PointerEvent, child: SiteChildWithStats) => void;
}

export default function SiteMarker({ child, isEditMode, isSelected, onClick, onDragStart }: Props) {
  const { bg, ring } = getStatusColor(child.device_stats);

  return (
    <div
      className={`absolute -translate-x-1/2 -translate-y-1/2 z-10 group ${isEditMode ? 'cursor-move' : 'cursor-pointer'}`}
      style={{ left: `${child.map_x}%`, top: `${child.map_y}%` }}
      onClick={(e) => { e.stopPropagation(); onClick(child); }}
      onPointerDown={isEditMode && onDragStart ? (e) => onDragStart(e, child) : undefined}
    >
      <div
        className={`w-8 h-8 rounded-lg flex items-center justify-center ${bg} ring-2 ${ring} shadow-md transition-transform
          ${isSelected ? 'scale-125 ring-4' : 'hover:scale-110'}
          ${child.device_stats.offline > 0 ? 'animate-pulse' : ''}`}
      >
        <Building2 className="h-4 w-4 text-white" />
      </div>
      {/* Hover label */}
      <div className="absolute left-1/2 -translate-x-1/2 -top-7 bg-gray-900 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity">
        {child.name} ({child.device_stats.total} devices)
      </div>
    </div>
  );
}
