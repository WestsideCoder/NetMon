// SPDX-License-Identifier: GPL-3.0-or-later
import { useState } from 'react';
import api from '../../api/client';

interface Props {
  onClose: () => void;
  forced?: boolean;
}

export default function ChangePasswordModal({ onClose, forced }: Props) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const inputClass = 'w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500';
  const labelClass = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';

  const handleSave = async () => {
    setError('');
    if (!currentPassword) { setError('Current password is required'); return; }
    if (!newPassword) { setError('New password is required'); return; }
    if (newPassword.length < 8) { setError('New password must be at least 8 characters'); return; }
    if (newPassword !== confirmPassword) { setError('New passwords do not match'); return; }

    setSaving(true);
    try {
      await api.post('/api/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
      });
      setSuccess(true);
      setTimeout(onClose, 1500);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg || 'Failed to change password');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={forced ? undefined : onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {forced ? 'Password Change Required' : 'Change Password'}
          </h3>
          {forced && <p className="text-sm text-yellow-600 dark:text-yellow-400 mt-1">You must change your password before continuing.</p>}
        </div>
        <div className="px-6 py-4 space-y-4">
          {error && (
            <div className="p-3 text-sm text-red-700 bg-red-50 dark:bg-red-900/30 dark:text-red-400 rounded-lg">{error}</div>
          )}
          {success && (
            <div className="p-3 text-sm text-green-700 bg-green-50 dark:bg-green-900/30 dark:text-green-400 rounded-lg">Password changed successfully</div>
          )}
          <div>
            <label className={labelClass}>Current Password *</label>
            <input type="password" className={inputClass} value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Enter current password" />
          </div>
          <div>
            <label className={labelClass}>New Password *</label>
            <input type="password" className={inputClass} value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)} placeholder="Enter new password" />
          </div>
          <div>
            <label className={labelClass}>Confirm New Password *</label>
            <input type="password" className={inputClass} value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Re-enter new password" />
          </div>
        </div>
        <div className="px-6 py-4 border-t dark:border-gray-700 flex justify-end gap-3">
          {!forced && (
            <button onClick={onClose}
              className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">
              Cancel
            </button>
          )}
          <button onClick={handleSave} disabled={saving || success}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Saving...' : 'Change Password'}
          </button>
        </div>
      </div>
    </div>
  );
}
