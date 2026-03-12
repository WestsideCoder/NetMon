// SPDX-License-Identifier: GPL-3.0-or-later
import UPSPanel from './UPSPanel';
import ServerPanel from './ServerPanel';
import NetworkPanel from './NetworkPanel';
import GenericPanel from './GenericPanel';
import type { SNMPDeviceData } from '../../types';

interface SNMPMetricPanelProps {
  data: SNMPDeviceData;
}

export default function SNMPMetricPanel({ data }: SNMPMetricPanelProps) {
  if (data.latest.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">SNMP Metrics</h3>
        <p className="text-sm text-gray-400">No SNMP data collected yet. Metrics will appear after the next poll cycle.</p>
      </div>
    );
  }

  let Panel;
  switch (data.device_type) {
    case 'ups':
      Panel = UPSPanel;
      break;
    case 'server':
      Panel = ServerPanel;
      break;
    case 'switch':
    case 'router':
      Panel = NetworkPanel;
      break;
    default:
      Panel = GenericPanel;
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">SNMP Metrics</h3>
        {data.template_name && (
          <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
            {data.template_name}
          </span>
        )}
      </div>
      <Panel data={data} />
    </div>
  );
}
