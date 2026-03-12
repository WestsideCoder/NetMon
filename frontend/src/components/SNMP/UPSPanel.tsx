// SPDX-License-Identifier: GPL-3.0-or-later
import MetricGauge from './MetricGauge';
import MetricValue from './MetricValue';
import MetricChart from './MetricChart';
import type { SNMPDeviceData } from '../../types';

function getMetric(data: SNMPDeviceData, name: string) {
  return data.latest.find((m) => m.oid_name === name);
}

function formatRuntime(ticks: string): string {
  const val = parseInt(ticks, 10);
  if (isNaN(val)) return ticks;
  // timeticks are in 1/100ths of seconds
  const minutes = Math.floor(val / 6000);
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h ${m}m`;
  }
  return `${minutes}m`;
}

export default function UPSPanel({ data }: { data: SNMPDeviceData }) {
  const battery = getMetric(data, 'upsAdvBatteryCapacity') || getMetric(data, 'upsEstimatedChargeRemaining');
  const load = getMetric(data, 'upsAdvOutputLoad') || getMetric(data, 'upsOutputPercentLoad');
  const runtime = getMetric(data, 'upsAdvBatteryRunTimeRemaining') || getMetric(data, 'upsEstimatedMinutesRemaining');
  const inputV = getMetric(data, 'upsAdvInputLineVoltage') || getMetric(data, 'upsInputVoltage');
  const outputV = getMetric(data, 'upsAdvOutputVoltage') || getMetric(data, 'upsOutputVoltage');
  const temp = getMetric(data, 'upsAdvBatteryTemperature') || getMetric(data, 'upsBatteryTemperature');
  const model = getMetric(data, 'upsBasicIdentModel');

  const batteryVal = battery ? parseFloat(battery.value) : 0;
  const loadVal = load ? parseFloat(load.value) : 0;
  const batteryHistKey = battery?.oid_name || '';
  const loadHistKey = load?.oid_name || '';

  return (
    <div className="space-y-4">
      {model && (
        <p className="text-sm text-gray-500 dark:text-gray-400">Model: {model.value}</p>
      )}
      <div className="flex flex-wrap gap-6 justify-center">
        <MetricGauge label="Battery" value={batteryVal} highIsGood />
        <MetricGauge label="Load" value={loadVal} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {runtime && <MetricValue label="Runtime" value={runtime.value_type === 'timeticks' ? formatRuntime(runtime.value) : `${runtime.value} min`} />}
        {inputV && <MetricValue label="Input Voltage" value={inputV.value} unit="V" />}
        {outputV && <MetricValue label="Output Voltage" value={outputV.value} unit="V" />}
        {temp && <MetricValue label="Temperature" value={temp.value} unit="°C" />}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {data.history[batteryHistKey] && (
          <MetricChart title="Battery %" data={data.history[batteryHistKey]} unit="%" color="#22c55e" maxY={100} />
        )}
        {data.history[loadHistKey] && (
          <MetricChart title="Load %" data={data.history[loadHistKey]} unit="%" color="#f59e0b" maxY={100} />
        )}
      </div>
    </div>
  );
}
