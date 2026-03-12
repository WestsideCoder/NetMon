// SPDX-License-Identifier: GPL-3.0-or-later
import { useState, useEffect } from 'react';
import api from '../../api/client';
import type { Site } from '../../types';

interface Props {
  site?: Site | null;
  parentId?: number | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function SiteForm({ site, parentId, onSuccess, onCancel }: Props) {
  const [sites, setSites] = useState<Site[]>([]);
  const [form, setForm] = useState({
    name: '',
    location: '',
    description: '',
    contact_name: '',
    contact_email: '',
    parent_site_id: null as number | null,
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const isEdit = !!site;

  useEffect(() => {
    api.get('/api/sites/').then((r) => setSites(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (site) {
      setForm({
        name: site.name,
        location: site.location || '',
        description: site.description || '',
        contact_name: site.contact_name || '',
        contact_email: site.contact_email || '',
        parent_site_id: site.parent_site_id,
      });
    } else if (parentId) {
      setForm((f) => ({ ...f, parent_site_id: parentId }));
    }
  }, [site, parentId]);

  // Filter out the site being edited (can't be its own parent)
  const availableParents = sites.filter((s) => !site || s.id !== site.id);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('Name is required'); return; }
    setSaving(true);
    setError('');
    const payload = {
      ...form,
      location: form.location || null,
      description: form.description || null,
      contact_name: form.contact_name || null,
      contact_email: form.contact_email || null,
    };
    try {
      if (isEdit) {
        await api.put(`/api/sites/${site.id}`, payload);
      } else {
        await api.post('/api/sites/', payload);
      }
      onSuccess();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Failed to save site';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const inputClass = 'w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white';
  const labelClass = 'block text-sm font-medium mb-1 dark:text-gray-300';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg mx-4">
        <div className="px-6 py-4 border-b dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {isEdit ? 'Edit Site' : 'Add Site'}
          </h3>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="px-6 py-4 space-y-4">
            {error && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/30 dark:text-red-400 p-3 rounded-lg">{error}</p>}

            <div>
              <label className={labelClass}>Name *</label>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} placeholder="e.g. Main Office" />
            </div>

            <div>
              <label className={labelClass}>Parent Site</label>
              <select
                value={form.parent_site_id ?? ''}
                onChange={(e) => setForm({ ...form, parent_site_id: e.target.value ? Number(e.target.value) : null })}
                className={inputClass}
              >
                <option value="">None (top-level site)</option>
                {availableParents.map((s) => (
                  <option key={s.id} value={s.id}>
                    {'  '.repeat(s.level)}{s.name}{s.location ? ` - ${s.location}` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Location</label>
                <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className={inputClass} placeholder="e.g. Building A, Floor 2" />
              </div>
              <div>
                <label className={labelClass}>Contact Name</label>
                <input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} className={inputClass} />
              </div>
            </div>

            <div>
              <label className={labelClass}>Contact Email</label>
              <input type="email" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} className={inputClass} />
            </div>

            <div>
              <label className={labelClass}>Description</label>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputClass} rows={2} />
            </div>
          </div>

          <div className="px-6 py-4 border-t dark:border-gray-700 flex justify-end gap-3">
            <button type="button" onClick={onCancel} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving...' : isEdit ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
