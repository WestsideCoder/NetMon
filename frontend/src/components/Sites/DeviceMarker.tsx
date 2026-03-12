// SPDX-License-Identifier: GPL-3.0-or-later
import { Server, Wifi, Camera, Monitor, Battery, Cpu, Radio, HelpCircle } from 'lucide-react';
import type { Device, DeviceType } from '../../types';

const STATUS_COLORS: Record<string, string> = {
  online: 'bg-green-500',
  warning: 'bg-yellow-500',
  offline: 'bg-red-500',
  unknown: 'bg-gray-400',
};

const STATUS_RING: Record<string, string> = {
  online: 'ring-green-300',
  warning: 'ring-yellow-300',
  offline: 'ring-red-300',
  unknown: 'ring-gray-300',
};

function getDeviceIcon(type: DeviceType | null) {
  switch (type) {
    case 'server': return Server;
    case 'switch': return Monitor;
    case 'router': return Cpu;
    case 'access_point': return Wifi;
    case 'camera': return Camera;
    case 'ups': return Battery;
    case 'iot': return Radio;
    default: return HelpCircle;
  }
}

interface Props {
  device: Device;
  isEditMode: boolean;
  isSelected: boolean;
  onClick: (device: Device) => void;
  onDragStart?: (e: React.PointerEvent, device: Device) => void;
}

export default function DeviceMarker({ device, isEditMode, isSelected, onClick, onDragStart }: Props) {
  const Icon = getDeviceIcon(device.device_type);
  const color = STATUS_COLORS[device.status] || STATUS_COLORS.unknown;
  const ring = STATUS_RING[device.status] || STATUS_RING.unknown;

  return (
    <div
      className={`absolute -translate-x-1/2 -translate-y-1/2 z-10 group ${isEditMode ? 'cursor-move' : 'cursor-pointer'}`}
      style={{ left: `${device.map_x}%`, top: `${device.map_y}%` }}
      onClick={(e) => { e.stopPropagation(); onClick(device); }}
      onPointerDown={isEditMode && onDragStart ? (e) => onDragStart(e, device) : undefined}
    >
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center ${color} ring-2 ${ring} shadow-md transition-transform
          ${isSelected ? 'scale-125 ring-4' : 'hover:scale-110'}
          ${device.status === 'offline' ? 'animate-pulse' : ''}`}
      >
        <Icon className="h-3.5 w-3.5 text-white" />
      </div>
      {/* Hover label */}
      <div className="absolute left-1/2 -translate-x-1/2 -top-7 bg-gray-900 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity">
        {device.name}
      </div>
    </div>
  );
}
