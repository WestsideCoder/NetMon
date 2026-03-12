// SPDX-License-Identifier: GPL-3.0-or-later
import { useState, useEffect } from 'react';
import api from '../../api/client';
import type { SNMPCredential } from '../../types';
import ConfirmDialog from '../Common/ConfirmDialog';

type SNMPVersion = 'v1' | 'v2c' | 'v3';

interface FormData {
  name: string;
  version: SNMPVersion;
  port: number;
  community: string;
  username: string;
  auth_protocol: string;
  auth_password: string;
  priv_protocol: string;
  priv_password: string;
  description: string;
}

const emptyForm: FormData = {
  name: '',
  version: 'v2c',
  port: 161,
  community: '',
  username: '',
  auth_protocol: '',
  auth_password: '',
  priv_protocol: '',
  priv_password: '',
  description: '',
};

export default function CredentialList() {
  const [creds, setCreds] = useState<SNMPCredential[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<FormData>({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<SNMPCredential | null>(null);

  const loadCreds = () => {
    api.get('/api/snmp/credentials').then((r) => setCreds(r.data)).catch(() => {});
  };

  useEffect(() => { loadCreds(); }, []);

  const openAdd = () => {
    setEditId(null);
    setForm({ ...emptyForm });
    setError('');
    setShowForm(true);
  };

  const openEdit = (c: SNMPCredential) => {
    setEditId(c.id);
    setForm({
      name: c.name,
      version: c.version as SNMPVersion,
      port: c.port,
      community: '',
      username: c.username || '',
      auth_protocol: c.auth_protocol || '',
      auth_password: '',
      priv_protocol: c.priv_protocol || '',
      priv_password: '',
      description: c.description || '',
    });
    setError('');
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Name is required'); return; }
    if (form.version !== 'v3' && !form.community.trim() && !editId) {
      setError('Community string is required for v1/v2c');
      return;
    }
    if (form.version === 'v3' && !form.username.trim() && !editId) {
      setError('Username is required for SNMPv3');
      return;
    }

    setSaving(true);
    setError('');

    // Build payload, omit empty optional fields on edit
    const payload: Record<string, unknown> = {
      name: form.name,
      version: form.version,
      port: form.port,
      description: form.description || null,
    };

    if (form.version === 'v3') {
      if (form.username) payload.username = form.username;
      if (form.auth_protocol) payload.auth_protocol = form.auth_protocol;
      if (form.auth_password) payload.auth_password = form.auth_password;
      if (form.priv_protocol) payload.priv_protocol = form.priv_protocol;
      if (form.priv_password) payload.priv_password = form.priv_password;
      payload.community = null;
    } else {
      if (form.community) payload.community = form.community;
      payload.username = null;
      payload.auth_protocol = null;
      payload.auth_password = null;
      payload.priv_protocol = null;
      payload.priv_password = null;
    }

    try {
      if (editId) {
        await api.put(`/api/snmp/credentials/${editId}`, payload);
      } else {
        await api.post('/api/snmp/credentials', payload);
      }
      setShowForm(false);
      loadCreds();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg || 'Failed to save credential');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/api/snmp/credentials/${deleteTarget.id}`);
      setDeleteTarget(null);
      loadCreds();
    } catch {
      setDeleteTarget(null);
    }
  };

  const set = (field: keyof FormData, value: string | number) =>
    setForm((f) => ({ ...f, [field]: value }));

  const inputClass = 'w-full px-3 py-2 text-sm border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500';
  const labelClass = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {creds.length} credential{creds.length !== 1 ? 's' : ''} configured
        </p>
        <button
          onClick={openAdd}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
        >
          + Add Credential
        </button>
      </div>

      {/* Credential list */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="px-4 py-3 border-b dark:border-gray-700">
          <h3 className="text-sm font-semibold dark:text-white">SNMP Credentials</h3>
        </div>
        <div className="divide-y dark:divide-gray-700">
          {creds.map((c) => (
            <div key={c.id} className="px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium dark:text-white">{c.name}</p>
                <p className="text-xs text-gray-500">
                  {c.version.toUpperCase()} - Port {c.port}
                  {c.community && ` - Community: ${c.community}`}
                  {c.username && ` - User: ${c.username}`}
                </p>
                {c.description && (
                  <p className="text-xs text-gray-400 mt-0.5">{c.description}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded ${c.enabled ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'}`}>
                  {c.enabled ? 'Active' : 'Disabled'}
                </span>
                <button
                  onClick={() => openEdit(c)}
                  className="text-xs px-2 py-1 text-blue-600 hover:bg-blue-50 dark:hover:bg-gray-700 rounded"
                >
                  Edit
                </button>
                <button
                  onClick={() => setDeleteTarget(c)}
                  className="text-xs px-2 py-1 text-red-600 hover:bg-red-50 dark:hover:bg-gray-700 rounded"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
          {creds.length === 0 && (
            <p className="px-4 py-8 text-sm text-gray-400 text-center">
              No credentials configured. Click "Add Credential" to create one.
            </p>
          )}
        </div>
      </div>

      {/* Add/Edit modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {editId ? 'Edit Credential' : 'Add SNMP Credential'}
              </h3>
            </div>
            <div className="px-6 py-4 space-y-4">
              {error && (
                <div className="p-3 text-sm text-red-700 bg-red-50 dark:bg-red-900/30 dark:text-red-400 rounded-lg">
                  {error}
                </div>
              )}

              <div>
                <label className={labelClass}>Name *</label>
                <input className={inputClass} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Public Read-Only" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>SNMP Version *</label>
                  <select className={inputClass} value={form.version} onChange={(e) => set('version', e.target.value)}>
                    <option value="v1">SNMPv1</option>
                    <option value="v2c">SNMPv2c</option>
                    <option value="v3">SNMPv3</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Port</label>
                  <input className={inputClass} type="number" value={form.port} onChange={(e) => set('port', parseInt(e.target.value) || 161)} />
                </div>
              </div>

              {/* v1/v2c fields */}
              {form.version !== 'v3' && (
                <div>
                  <label className={labelClass}>Community String {!editId && '*'}</label>
                  <input className={inputClass} type="password" value={form.community} onChange={(e) => set('community', e.target.value)} placeholder={editId ? '(leave blank to keep current)' : 'e.g. public'} />
                </div>
              )}

              {/* v3 fields */}
              {form.version === 'v3' && (
                <>
                  <div>
                    <label className={labelClass}>Username {!editId && '*'}</label>
                    <input className={inputClass} value={form.username} onChange={(e) => set('username', e.target.value)} placeholder="SNMPv3 security name" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>Auth Protocol</label>
                      <select className={inputClass} value={form.auth_protocol} onChange={(e) => set('auth_protocol', e.target.value)}>
                        <option value="">None (noAuth)</option>
                        <option value="MD5">MD5</option>
                        <option value="SHA">SHA</option>
                        <option value="SHA256">SHA-256</option>
                        <option value="SHA512">SHA-512</option>
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>Auth Password</label>
                      <input className={inputClass} type="password" value={form.auth_password} onChange={(e) => set('auth_password', e.target.value)} placeholder={editId ? '(leave blank to keep)' : 'Auth passphrase'} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>Privacy Protocol</label>
                      <select className={inputClass} value={form.priv_protocol} onChange={(e) => set('priv_protocol', e.target.value)}>
                        <option value="">None (noPriv)</option>
                        <option value="DES">DES</option>
                        <option value="AES">AES-128</option>
                        <option value="AES192">AES-192</option>
                        <option value="AES256">AES-256</option>
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>Privacy Password</label>
                      <input className={inputClass} type="password" value={form.priv_password} onChange={(e) => set('priv_password', e.target.value)} placeholder={editId ? '(leave blank to keep)' : 'Priv passphrase'} />
                    </div>
                  </div>
                </>
              )}

              <div>
                <label className={labelClass}>Description</label>
                <input className={inputClass} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Optional description" />
              </div>
            </div>

            <div className="px-6 py-4 border-t dark:border-gray-700 flex justify-end gap-3">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Saving...' : editId ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Credential"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? Devices using this credential will lose their SNMP configuration.`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
