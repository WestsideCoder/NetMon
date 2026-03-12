// SPDX-License-Identifier: GPL-3.0-or-later
import { useState } from 'react';
import api from '../../api/client';
import { useAuth } from '../../hooks/useAuth';

interface Props {
  onClose: () => void;
}

export default function UserSettingsModal({ onClose }: Props) {
  const { user, loadUser } = useAuth();
  const [email, setEmail] = useState(user?.email || '');
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const inputClass = 'w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500';
  const labelClass = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';

  const handleSave = async () => {
    setError('');
    if (!email.trim()) { setError('Email is required'); return; }

    setSaving(true);
    try {
      await api.put('/api/auth/me', {
        email: email.trim(),
        full_name: fullName.trim() || null,
      });
      await loadUser();
      setSuccess(true);
      setTimeout(onClose, 1200);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg || 'Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">User Settings</h3>
        </div>
        <div className="px-6 py-4 space-y-4">
          {error && (
            <div className="p-3 text-sm text-red-700 bg-red-50 dark:bg-red-900/30 dark:text-red-400 rounded-lg">{error}</div>
          )}
          {success && (
            <div className="p-3 text-sm text-green-700 bg-green-50 dark:bg-green-900/30 dark:text-green-400 rounded-lg">Settings updated</div>
          )}
          <div>
            <label className={labelClass}>Username</label>
            <input className={inputClass + ' opacity-60 cursor-not-allowed'} value={user?.username || ''} disabled />
          </div>
          <div>
            <label className={labelClass}>Role</label>
            <input className={inputClass + ' opacity-60 cursor-not-allowed'} value={user?.role || ''} disabled />
          </div>
          <div>
            <label className={labelClass}>Email *</label>
            <input type="email" className={inputClass} value={email}
              onChange={(e) => setEmail(e.target.value)} placeholder="user@example.com" />
          </div>
          <div>
            <label className={labelClass}>Full Name</label>
            <input className={inputClass} value={fullName}
              onChange={(e) => setFullName(e.target.value)} placeholder="John Doe" />
          </div>
        </div>
        <div className="px-6 py-4 border-t dark:border-gray-700 flex justify-end gap-3">
          <button onClick={onClose}
            className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving || success}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
