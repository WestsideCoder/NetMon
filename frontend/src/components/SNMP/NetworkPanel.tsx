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

export default function NetworkPanel({ data }: { data: SNMPDeviceData }) {
  const cpu = getMetric(data, 'cpuBusyPer') || getMetric(data, 'cpuBusyPer5min');
  const memUsed = getMetric(data, 'ciscoMemoryPoolUsed');
  const memFree = getMetric(data, 'ciscoMemoryPoolFree');
  const temp = getMetric(data, 'ciscoEnvMonTemperatureValue');
  const ifCount = getMetric(data, 'ifNumber');
  const uptime = getMetric(data, 'sysUpTime');

  const cpuVal = cpu ? parseFloat(cpu.value) : 0;
  const memTotal = memUsed && memFree ? parseFloat(memUsed.value) + parseFloat(memFree.value) : 0;
  const memPct = memTotal > 0 ? Math.round((parseFloat(memUsed!.value) / memTotal) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {cpu && <MetricProgressBar label="CPU" value={cpuVal} />}
        {memUsed && <MetricProgressBar label="Memory" value={memPct} />}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {temp && <MetricValue label="Temperature" value={temp.value} unit="°C" />}
        {ifCount && <MetricValue label="Interfaces" value={ifCount.value} />}
        {uptime && <MetricValue label="Uptime" value={formatUptime(uptime.value)} />}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {cpu && data.history[cpu.oid_name] && (
          <MetricChart title="CPU %" data={data.history[cpu.oid_name]} unit="%" color="#3b82f6" />
        )}
        {temp && data.history['ciscoEnvMonTemperatureValue'] && (
          <MetricChart title="Temperature" data={data.history['ciscoEnvMonTemperatureValue']} unit="°C" color="#ef4444" />
        )}
      </div>
    </div>
  );
}
