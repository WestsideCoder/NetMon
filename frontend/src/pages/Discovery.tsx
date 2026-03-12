// SPDX-License-Identifier: GPL-3.0-or-later
import NetworkScanner from '../components/Discovery/NetworkScanner';

export default function Discovery() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Network Discovery</h1>
      <NetworkScanner />
    </div>
  );
}
