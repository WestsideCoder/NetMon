// SPDX-License-Identifier: GPL-3.0-or-later
import CredentialList from '../components/SNMP/CredentialList';

export default function SNMPSettings() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">SNMP Configuration</h1>
      <CredentialList />
    </div>
  );
}
