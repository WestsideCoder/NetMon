// SPDX-License-Identifier: GPL-3.0-or-later
import { Moon, Sun, LogOut, User, Settings, KeyRound, ChevronDown } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useSidebarStore } from '../../store/sidebarStore';
import UserSettingsModal from './UserSettingsModal';
import ChangePasswordModal from './ChangePasswordModal';

export default function Header() {
  const { user, logout } = useAuth();
  const collapsed = useSidebarStore((s) => s.collapsed);
  const [dark, setDark] = useState(() => localStorage.getItem('theme') === 'dark');
  const [menuOpen, setMenuOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }, [dark]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const isLocal = user?.auth_source === 'local';

  return (
    <>
      <header className={`fixed top-0 right-0 z-30 h-16 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between px-6 transition-all duration-200 ${collapsed ? 'left-16' : 'left-64'}`}>
        <h1 className="text-lg font-semibold text-gray-800 dark:text-white">NetMon <span className="text-sm text-yellow-500 font-normal">(Beta)</span></h1>
        <div className="flex items-center gap-4">
          <button onClick={() => setDark(!dark)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
            {dark ? <Sun className="h-5 w-5 text-gray-400" /> : <Moon className="h-5 w-5 text-gray-600" />}
          </button>

          {/* User menu */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 px-2 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <User className="h-4 w-4" />
              <span>{user?.username}</span>
              <span className="text-xs px-1.5 py-0.5 bg-primary-100 text-primary-700 rounded dark:bg-primary-900 dark:text-primary-300">{user?.role}</span>
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
            </button>

            {menuOpen && (
              <div className="absolute right-0 mt-1 w-52 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50">
                {/* User info header */}
                <div className="px-4 py-2 border-b dark:border-gray-700">
                  <p className="text-sm font-medium dark:text-white">{user?.full_name || user?.username}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user?.email}</p>
                </div>

                <button
                  onClick={() => { setMenuOpen(false); setShowSettings(true); }}
                  className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <Settings className="h-4 w-4" />
                  User Settings
                </button>

                {isLocal && (
                  <button
                    onClick={() => { setMenuOpen(false); setShowPassword(true); }}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    <KeyRound className="h-4 w-4" />
                    Change Password
                  </button>
                )}

                <div className="border-t dark:border-gray-700 mt-1 pt-1">
                  <button
                    onClick={() => { setMenuOpen(false); logout(); }}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    <LogOut className="h-4 w-4" />
                    Logout
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {showSettings && <UserSettingsModal onClose={() => setShowSettings(false)} />}
      {showPassword && <ChangePasswordModal onClose={() => setShowPassword(false)} />}
    </>
  );
}
