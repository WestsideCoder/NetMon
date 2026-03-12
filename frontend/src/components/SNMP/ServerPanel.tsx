// SPDX-License-Identifier: GPL-3.0-or-later
import MetricProgressBar from './MetricProgressBar';
import MetricValue from './MetricValue';
import MetricChart from './MetricChart';
import type { SNMPDeviceData } from '../../types';

function getMetric(data: SNMPDeviceData, name: string) {
  return data.latest.find((m) => m.oid_name === name);
}

function formatUptime(ticks: string): string {
  const val = parseInt(ticks, 10);
  if (isNaN(val)) return ticks;
  const seconds = val / 100;
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days > 0) return `${days}d ${hours}h`;
  return `${hours}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function formatBytes(b: number): string {
  if (b <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(b) / Math.log(1024)), units.length - 1);
  return `${(b / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export default function ServerPanel({ data }: { data: SNMPDeviceData }) {
  // New walk-based metrics (cpuLoadAvg, memoryUsedPercent, diskUsedPercent)
  const cpuAvg = getMetric(data, 'cpuLoadAvg');
  const memPct = getMetric(data, 'memoryUsedPercent');
  const diskPct = getMetric(data, 'diskUsedPercent');
  const memTotal = getMetric(data, 'memoryTotalBytes');
  const memUsed = getMetric(data, 'memoryUsedBytes');

  // Legacy metrics (hrProcessorLoad with hardcoded index — Linux only)
  const cpuLegacy = getMetric(data, 'hrProcessorLoad');
  const ramUsedLegacy = getMetric(data, 'hrStorageUsed_ram');
  const ramSizeLegacy = getMetric(data, 'hrStorageSize_ram');
  const diskUsedLegacy = getMetric(data, 'hrStorageUsed_disk');
  const diskSizeLegacy = getMetric(data, 'hrStorageSize_disk');

  const procs = getMetric(data, 'hrSystemProcesses');
  const uptime = getMetric(data, 'sysUpTime');

  // Use new metrics if available, fall back to legacy
  const cpuVal = cpuAvg ? parseFloat(cpuAvg.value) : cpuLegacy ? parseFloat(cpuLegacy.value) : 0;
  const hasCpu = !!(cpuAvg || cpuLegacy);

  const ramPctVal = memPct
    ? parseFloat(memPct.value)
    : (ramUsedLegacy && ramSizeLegacy)
      ? Math.round((parseFloat(ramUsedLegacy.value) / parseFloat(ramSizeLegacy.value)) * 100)
      : 0;
  const hasRam = !!(memPct || (ramUsedLegacy && ramSizeLegacy));

  const diskPctVal = diskPct
    ? parseFloat(diskPct.value)
    : (diskUsedLegacy && diskSizeLegacy)
      ? Math.round((parseFloat(diskUsedLegacy.value) / parseFloat(diskSizeLegacy.value)) * 100)
      : 0;
  const hasDisk = !!(diskPct || (diskUsedLegacy && diskSizeLegacy));

  // Find per-disk metrics for detailed breakdown
  const perDiskMetrics = data.latest.filter(m => m.oid_name.startsWith('diskUsedPercent_'));

  // Memory display string
  const memDisplay = memTotal && memUsed
    ? `${formatBytes(parseFloat(memUsed.value))} / ${formatBytes(parseFloat(memTotal.value))}`
    : (ramUsedLegacy && ramSizeLegacy)
      ? `${ramUsedLegacy.value} / ${ramSizeLegacy.value} units`
      : null;

  // Chart keys — prefer new metric names, fall back to legacy
  const cpuHistKey = data.history['cpuLoadAvg'] ? 'cpuLoadAvg' : 'hrProcessorLoad';
  const memHistKey = data.history['memoryUsedPercent'] ? 'memoryUsedPercent' : 'hrStorageUsed_ram';
  const diskHistKey = data.history['diskUsedPercent'] ? 'diskUsedPercent' : null;

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {hasCpu && <MetricProgressBar label="CPU" value={cpuVal} />}
        {hasRam && <MetricProgressBar label="Memory" value={ramPctVal} />}
        {hasDisk && <MetricProgressBar label="Disk" value={diskPctVal} />}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {procs && <MetricValue label="Processes" value={procs.value} />}
        {uptime && <MetricValue label="Uptime" value={formatUptime(uptime.value)} />}
        {memDisplay && <MetricValue label="RAM Used/Total" value={memDisplay} />}
      </div>

      {/* Per-disk breakdown if multiple disks */}
      {perDiskMetrics.length > 1 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Disk Breakdown</p>
          {perDiskMetrics.map(m => {
            const label = m.oid_name.replace('diskUsedPercent_', '').replace(/_/g, '/');
            return (
              <MetricProgressBar key={m.oid_name} label={label} value={parseFloat(m.value)} />
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {data.history[cpuHistKey] && (
          <MetricChart title="CPU %" data={data.history[cpuHistKey]} unit="%" color="#3b82f6" maxY={100} />
        )}
        {data.history[memHistKey] && (
          <MetricChart
            title="Memory %"
            data={data.history[memHistKey]}
            unit={memHistKey === 'memoryUsedPercent' ? '%' : ''}
            color="#8b5cf6"
            maxY={memHistKey === 'memoryUsedPercent' ? 100 : undefined}
          />
        )}
        {diskHistKey && data.history[diskHistKey] && (
          <MetricChart title="Disk %" data={data.history[diskHistKey]} unit="%" color="#f59e0b" maxY={100} />
        )}
      </div>
    </div>
  );
}
