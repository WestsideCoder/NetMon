// SPDX-License-Identifier: GPL-3.0-or-later
import { useState, useEffect } from 'react';
import api from '../../api/client';
import type { DeviceType, Site, SNMPCredential, SNMPTemplate } from '../../types';
/* Sites are passed as a prop from the parent (already loaded for filters). */

interface Props {
  count: number;
  ids: number[];
  sites: Site[];
  onSuccess: () => void;
  onCancel: () => void;
}

export default function BulkEditForm({ count, ids, sites, onSuccess, onCancel }: Props) {
  // Track which fields the user wants to change
  const [enabledFields, setEnabledFields] = useState<Record<string, boolean>>({});
  const [form, setForm] = useState({
    site_id: 0,
    device_type: 'other' as DeviceType,
    snmp_enabled: false,
    snmp_credential_id: null as number | null,
    snmp_template_id: null as number | null,
    maintenance_mode: false,
  });
  const [credentials, setCredentials] = useState<SNMPCredential[]>([]);
  const [templates, setTemplates] = useState<SNMPTemplate[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/api/snmp/credentials').then((r) => setCredentials(r.data)).catch(() => {});
    api.get('/api/snmp/templates').then((r) => setTemplates(r.data)).catch(() => {});
  }, []);

  const toggleField = (field: string) =>
    setEnabledFields((prev) => ({ ...prev, [field]: !prev[field] }));

  const handleSave = async () => {
    const updates: Record<string, unknown> = {};
    if (enabledFields.site_id && form.site_id) updates.site_id = form.site_id;
    if (enabledFields.device_type) updates.device_type = form.device_type;
    if (enabledFields.snmp_enabled) {
      updates.snmp_enabled = form.snmp_enabled;
      if (form.snmp_enabled) {
        updates.snmp_credential_id = form.snmp_credential_id;
        updates.snmp_template_id = form.snmp_template_id;
      } else {
        updates.snmp_credential_id = null;
        updates.snmp_template_id = null;
      }
    }
    if (enabledFields.maintenance_mode) updates.maintenance_mode = form.maintenance_mode;

    if (Object.keys(updates).length === 0) {
      setError('Select at least one field to update');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await api.patch('/api/devices/bulk', { ids, updates });
      onSuccess();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg || 'Failed to update devices');
    } finally {
      setSaving(false);
    }
  };

  const inputClass = 'w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500';
  const labelClass = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';

  const fields: { key: string; label: string }[] = [
    { key: 'site_id', label: 'Site' },
    { key: 'device_type', label: 'Device Type' },
    { key: 'snmp_enabled', label: 'SNMP' },
    { key: 'maintenance_mode', label: 'Maintenance Mode' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Bulk Edit {count} Device{count !== 1 ? 's' : ''}
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">Check the fields you want to change</p>
        </div>
        <div className="px-6 py-4 space-y-4">
          {error && (
            <div className="p-3 text-sm text-red-700 bg-red-50 dark:bg-red-900/30 dark:text-red-400 rounded-lg">{error}</div>
          )}

          {fields.map(({ key, label }) => (
            <div key={key} className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!enabledFields[key]}
                  onChange={() => toggleField(key)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm font-medium dark:text-gray-300">{label}</span>
              </label>

              {enabledFields[key] && (
                <div className="ml-6">
                  {key === 'site_id' && (
                    <div>
                      <label className={labelClass}>Move to Site</label>
                      <select className={inputClass} value={form.site_id} onChange={(e) => setForm({ ...form, site_id: Number(e.target.value) })}>
                        <option value={0} disabled>Select a site</option>
                        {sites.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}{s.location ? ` (${s.location})` : ''}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {key === 'device_type' && (
                    <div>
                      <label className={labelClass}>Type</label>
                      <select className={inputClass} value={form.device_type} onChange={(e) => setForm({ ...form, device_type: e.target.value as DeviceType })}>
                        {['ups', 'switch', 'router', 'server', 'camera', 'access_point', 'iot', 'other'].map((t) => (
                          <option key={t} value={t}>{t.replace('_', ' ')}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {key === 'snmp_enabled' && (
                    <div className="space-y-3">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={form.snmp_enabled}
                          onChange={(e) => setForm({ ...form, snmp_enabled: e.target.checked })}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm dark:text-gray-300">Enable SNMP</span>
                      </label>
                      {form.snmp_enabled && (
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className={labelClass}>Credential</label>
                            <select className={inputClass} value={form.snmp_credential_id || ''} onChange={(e) => setForm({ ...form, snmp_credential_id: e.target.value ? Number(e.target.value) : null })}>
                              <option value="">Select</option>
                              {credentials.filter(c => c.enabled).map((c) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className={labelClass}>Template</label>
                            <select className={inputClass} value={form.snmp_template_id || ''} onChange={(e) => setForm({ ...form, snmp_template_id: e.target.value ? Number(e.target.value) : null })}>
                              <option value="">Auto-detect</option>
                              {templates.filter(t => t.enabled).map((t) => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {key === 'maintenance_mode' && (
                    <div>
                      <label className={labelClass}>Action</label>
                      <select
                        className={inputClass}
                        value={form.maintenance_mode ? 'add' : 'remove'}
                        onChange={(e) => setForm({ ...form, maintenance_mode: e.target.value === 'add' })}
                      >
                        <option value="add">Add to maintenance</option>
                        <option value="remove">Remove from maintenance</option>
                      </select>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="px-6 py-4 border-t dark:border-gray-700 flex justify-end gap-3">
          <button onClick={onCancel}
            className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Updating...' : `Update ${count} Device${count !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
