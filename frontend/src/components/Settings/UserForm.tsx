// SPDX-License-Identifier: GPL-3.0-or-later
import { useState } from 'react';
import api from '../../api/client';
import type { User, UserRole } from '../../types';

interface UserFormData {
  username: string;
  email: string;
  password: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
}

const emptyForm: UserFormData = {
  username: '', email: '', password: '', full_name: '', role: 'viewer', is_active: true,
};

interface Props {
  user?: User;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function UserForm({ user, onSuccess, onCancel }: Props) {
  const isEdit = !!user;
  const [form, setForm] = useState<UserFormData>(
    user
      ? { username: user.username, email: user.email, password: '', full_name: user.full_name || '', role: user.role, is_active: user.is_active }
      : { ...emptyForm },
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const inputClass = 'w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500';
  const labelClass = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';

  const handleSave = async () => {
    if (!form.username.trim()) { setError('Username is required'); return; }
    if (!form.email.trim()) { setError('Email is required'); return; }
    if (!isEdit && !form.password.trim()) { setError('Password is required for new users'); return; }

    setSaving(true);
    setError('');
    try {
      if (isEdit) {
        const payload: Record<string, unknown> = {
          email: form.email,
          full_name: form.full_name || null,
          role: form.role,
          is_active: form.is_active,
        };
        if (form.password.trim()) payload.password = form.password;
        await api.put(`/api/users/${user!.id}`, payload);
      } else {
        await api.post('/api/users/', {
          username: form.username,
          email: form.email,
          password: form.password,
          full_name: form.full_name || null,
          role: form.role,
        });
      }
      onSuccess();
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
      let msg: string;
      if (typeof detail === 'string') {
        msg = detail;
      } else if (Array.isArray(detail)) {
        msg = detail.map((d: { msg?: string }) => d.msg || '').filter(Boolean).join(', ');
      } else {
        msg = 'Failed to save user';
      }
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="px-6 py-4 border-b dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {isEdit ? 'Edit User' : 'Add User'}
          </h3>
        </div>
        <div className="px-6 py-4 space-y-4">
          {error && (
            <div className="p-3 text-sm text-red-700 bg-red-50 dark:bg-red-900/30 dark:text-red-400 rounded-lg">{error}</div>
          )}
          <div>
            <label className={labelClass}>Username *</label>
            <input
              className={inputClass}
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              disabled={isEdit}
              placeholder="e.g. jdoe"
            />
          </div>
          <div>
            <label className={labelClass}>Email *</label>
            <input
              type="email"
              className={inputClass}
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="user@example.com"
            />
          </div>
          <div>
            <label className={labelClass}>Password {!isEdit && '*'}</label>
            <input
              type="password"
              className={inputClass}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder={isEdit ? '(leave blank to keep current)' : 'Enter password'}
            />
          </div>
          <div>
            <label className={labelClass}>Full Name</label>
            <input
              className={inputClass}
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              placeholder="John Doe"
            />
          </div>
          <div>
            <label className={labelClass}>Role *</label>
            <select
              className={inputClass}
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
            >
              <option value="admin">Admin</option>
              <option value="operator">Operator</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>
          {isEdit && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm dark:text-gray-300">Active</span>
            </label>
          )}
        </div>
        <div className="px-6 py-4 border-t dark:border-gray-700 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : isEdit ? 'Update' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
