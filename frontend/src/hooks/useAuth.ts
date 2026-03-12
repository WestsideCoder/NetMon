// SPDX-License-Identifier: GPL-3.0-or-later
import { useAuthStore } from '../store/authStore';

export function useAuth() {
  return useAuthStore();
}
