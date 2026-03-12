// SPDX-License-Identifier: GPL-3.0-or-later
import { useAuth } from './useAuth';

export function useRole() {
  const { user } = useAuth();
  return {
    canEdit: !!user && (user.role === 'admin' || user.role === 'operator'),
    isAdmin: user?.role === 'admin',
  };
}
