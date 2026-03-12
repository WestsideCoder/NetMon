// SPDX-License-Identifier: GPL-3.0-or-later
import { useState, useEffect } from 'react';
import { Scan } from 'lucide-react';
import api from '../../api/client';
import type { Device, DeviceType, Site, SNMPCredential, SNMPTemplate } from '../../types';

interface Props {
  siteId?: number;
  device?: Device;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function DeviceForm({ siteId, device, onSuccess, onCancel }: Props) {
  const isEdit = !!device;
  const [form, setForm] = useState({
    name: device?.name || '',
    ip_address: device?.ip_address || '',
    device_type: device?.device_type || 'other',
    site_id: device?.site_id || siteId || 0,
    vlan: device?.vlan || '',
    snmp_enabled: device?.snmp_enabled || false,
    snmp_credential_id: device?.snmp_credential_id || null as number | null,
    snmp_template_id: device?.snmp_template_id || null as number | null,
    http_url: device?.http_url || '',
    http_expected_status: device?.http_url ? (200) : null as number | null,
    ntp_enabled: device?.ntp_enabled || false,
    web_check_enabled: device?.web_check_enabled || false,
    os_info: device?.os_info || null as string | null,
    notes: device?.notes || '',
  });
  const [error, setError] = useState('');
  const [probing, setProbing] = useState(false);
  const [probeMsg, setProbeMsg] = useState('');
  const [sites, setSites] = useState<Site[]>([]);
  const [credentials, setCredentials] = useState<SNMPCredential[]>([]);
  const [templates, setTemplates] = useState<SNMPTemplate[]>([]);

  useEffect(() => {
    api.get('/api/sites/').then((r) => setSites(r.data)).catch(() => {});
    api.get('/api/snmp/credentials').then((r) => setCredentials(r.data)).catch(() => {});
    api.get('/api/snmp/templates').then((r) => setTemplates(r.data)).catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const payload = {
      ...form,
      vlan: form.vlan || null,
      http_url: form.http_url || null,
      http_expected_status: form.http_url ? (form.http_expected_status || 200) : null,
      snmp_credential_id: form.snmp_enabled ? form.snmp_credential_id : null,
      snmp_template_id: form.snmp_enabled ? form.snmp_template_id : null,
    };
    try {
      if (isEdit) {
        await api.put(`/api/devices/${device.id}`, payload);
      } else {
        await api.post('/api/devices/', payload);
      }
      onSuccess();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || `Failed to ${isEdit ? 'update' : 'create'} device`;
      setError(msg);
    }
  };

  const handleProbe = async () => {
    if (!form.ip_address || !form.snmp_credential_id) return;
    setProbing(true);
    setProbeMsg('');
    try {
      const res = await api.post('/api/snmp/test', {
        ip_address: form.ip_address,
        credential_id: form.snmp_credential_id,
      });
      const data = res.data as {
        success: boolean;
        sys_name?: string;
        detected_type?: string;
        os_info?: string;
        error?: string;
      };
      if (data.success) {
        const updates: Partial<typeof form> = {};
        if (data.sys_name) updates.name = data.sys_name;
        if (data.detected_type) {
          updates.device_type = data.detected_type as DeviceType;
          // Auto-match a template by device_type + OS info
          const candidates = templates.filter(t => t.enabled && t.device_type === data.detected_type);
          let match = candidates[0];
          if (candidates.length > 1 && data.os_info) {
            const osLower = data.os_info.toLowerCase();
            const osMatch = candidates.find(t => {
              const nameLower = t.name.toLowerCase();
              if (osLower.includes('windows') && nameLower.includes('windows')) return true;
              if (osLower.includes('linux') && nameLower.includes('linux')) return true;
              if (osLower.includes('cisco') && nameLower.includes('cisco')) return true;
              return false;
            });
            if (osMatch) match = osMatch;
          }
          if (match) updates.snmp_template_id = match.id;
        }
        if (data.os_info) updates.os_info = data.os_info;
        setForm(f => ({ ...f, ...updates }));
        setProbeMsg(`SNMP probe succeeded${data.os_info ? ` — ${data.os_info}` : ''} — fields updated`);
      } else {
        setProbeMsg(data.error || 'SNMP probe failed — no response');
      }
    } catch {
      setProbeMsg('SNMP probe request failed');
    } finally {
      setProbing(false);
      setTimeout(() => setProbeMsg(''), 5000);
    }
  };

  const inputClass = 'w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white';
  const labelClass = 'block text-sm font-medium mb-1 dark:text-gray-300';

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
      <h3 className="text-lg font-semibold dark:text-white">{isEdit ? 'Edit Device' : 'Add Device'}</h3>
      {error && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/30 dark:text-red-400 p-2 rounded">{error}</p>}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Name *</label>
          <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>IP Address *</label>
          <input required value={form.ip_address} onChange={(e) => setForm({ ...form, ip_address: e.target.value })} className={inputClass} placeholder="192.168.1.1" />
        </div>
        <div>
          <label className={labelClass}>Type</label>
          <select value={form.device_type} onChange={(e) => setForm({ ...form, device_type: e.target.value as DeviceType })} className={inputClass}>
            {['ups', 'switch', 'router', 'server', 'camera', 'access_point', 'iot', 'other'].map((t) => (
              <option key={t} value={t}>{t.replace('_', ' ')}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Site *</label>
          <select required value={form.site_id} onChange={(e) => setForm({ ...form, site_id: Number(e.target.value) })} className={inputClass}>
            <option value={0} disabled>Select a site</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>{s.name}{s.location ? ` (${s.location})` : ''}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>VLAN</label>
          <input value={form.vlan} onChange={(e) => setForm({ ...form, vlan: e.target.value })} className={inputClass} placeholder="e.g. 100" />
        </div>
        <div>
          <label className={labelClass}>HTTP URL</label>
          <input value={form.http_url} onChange={(e) => setForm({ ...form, http_url: e.target.value })} className={inputClass} placeholder="https://..." />
        </div>
      </div>

      {/* SNMP Section */}
      <div className="border dark:border-gray-700 rounded-lg p-3 space-y-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={form.snmp_enabled} onChange={(e) => setForm({ ...form, snmp_enabled: e.target.checked })}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
          <span className="text-sm font-medium dark:text-gray-300">Enable SNMP Monitoring</span>
        </label>
        {form.snmp_enabled && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>SNMP Credential</label>
                <select value={form.snmp_credential_id || ''} onChange={(e) => setForm({ ...form, snmp_credential_id: e.target.value ? Number(e.target.value) : null })} className={inputClass}>
                  <option value="">Select credential</option>
                  {credentials.filter(c => c.enabled).map((c) => (
                    <option key={c.id} value={c.id}>{c.name} ({c.version})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>SNMP Template</label>
                <select value={form.snmp_template_id || ''} onChange={(e) => setForm({ ...form, snmp_template_id: e.target.value ? Number(e.target.value) : null })} className={inputClass}>
                  <option value="">Auto-detect</option>
                  {templates.filter(t => t.enabled).map((t) => (
                    <option key={t.id} value={t.id}>{t.name}{t.device_type ? ` (${t.device_type})` : ''}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">Leave as auto-detect to assign based on device response</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleProbe}
                disabled={probing || !form.ip_address || !form.snmp_credential_id}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                <Scan className="h-3.5 w-3.5" />
                {probing ? 'Probing...' : 'Probe SNMP'}
              </button>
              <span className="text-xs text-gray-400">Query device to auto-fill name, type, and template</span>
              {probeMsg && (
                <span className={`text-xs ${probeMsg.includes('succeeded') ? 'text-green-600' : 'text-red-500'}`}>{probeMsg}</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* NTP & Web Check toggles */}
      <div className="border dark:border-gray-700 rounded-lg p-3 space-y-3">
        <p className="text-sm font-medium dark:text-gray-300">Additional Checks</p>
        <div className="flex items-center gap-6">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.ntp_enabled} onChange={(e) => setForm({ ...form, ntp_enabled: e.target.checked })}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            <span className="text-sm dark:text-gray-300">NTP Check</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.web_check_enabled} onChange={(e) => setForm({ ...form, web_check_enabled: e.target.checked })}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            <span className="text-sm dark:text-gray-300">Web Check (HTTP/HTTPS)</span>
          </label>
        </div>
        <p className="text-xs text-gray-400">Enable to include these checks when using Test Now on the device detail page</p>
      </div>

      <div>
        <label className={labelClass}>Notes</label>
        <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inputClass} rows={2} />
      </div>

      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700 dark:text-gray-300">Cancel</button>
        <button type="submit" className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700">
          {isEdit ? 'Update Device' : 'Create Device'}
        </button>
      </div>
    </form>
  );
}
