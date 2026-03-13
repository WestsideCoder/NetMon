// SPDX-License-Identifier: GPL-3.0-or-later
import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Monitor, MapPin, Bell, Search, Settings, Shield, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useSidebarStore } from '../../store/sidebarStore';
import api from '../../api/client';

const nav = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/devices', icon: Monitor, label: 'Devices' },
  { to: '/sites', icon: MapPin, label: 'Sites' },
  { to: '/alerts', icon: Bell, label: 'Alerts' },
  { to: '/discovery', icon: Search, label: 'Discovery' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

interface VersionInfo {
  current_version: string;
  latest_version: string | null;
  update_available: boolean;
  release_url: string | null;
  error: string | null;
}

export default function Sidebar() {
  const { collapsed, toggle } = useSidebarStore();
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);

  useEffect(() => {
    api.get('/api/settings/version').then((r) => setVersionInfo(r.data)).catch(() => {});
  }, []);

  return (
    <aside
      className={`fixed left-0 top-0 z-40 h-screen bg-gray-900 text-white flex flex-col transition-all duration-200 ${
        collapsed ? 'w-16' : 'w-64'
      }`}
    >
      {/* Logo */}
      <div className={`flex items-center border-b border-gray-700 ${collapsed ? 'justify-center px-2 py-5' : 'gap-2 px-6 py-5'}`}>
        <Shield className="h-7 w-7 text-primary-400 shrink-0" />
        {!collapsed && (
          <>
            <span className="text-xl font-bold">NetMon</span>
            <span className="text-xs text-yellow-400 ml-1">Beta</span>
          </>
        )}
      </div>

      {/* Nav links */}
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
        {nav.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `group relative flex items-center rounded-lg text-sm transition-colors ${
                collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5'
              } ${isActive ? 'bg-primary-600 text-white' : 'text-gray-300 hover:bg-gray-800'}`
            }
          >
            <Icon className="h-5 w-5 shrink-0" />
            {collapsed ? (
              <span className="absolute left-full ml-2 px-2.5 py-1.5 rounded-md bg-gray-800 text-white text-xs font-medium whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all shadow-lg z-50">
                {label}
              </span>
            ) : (
              <span>{label}</span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Version & update indicator */}
      {versionInfo && (
        <div className={`border-t border-gray-700 ${collapsed ? 'px-2 py-2' : 'px-4 py-2'}`}>
          {collapsed ? (
            versionInfo.update_available ? (
              <a href={versionInfo.release_url || '#'} target="_blank" rel="noopener noreferrer" title={`Update available: v${versionInfo.latest_version}`}>
                <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse mx-auto" />
              </a>
            ) : (
              <div className="text-[10px] text-gray-500 text-center" title={`v${versionInfo.current_version}`}>
                v{versionInfo.current_version}
              </div>
            )
          ) : (
            versionInfo.update_available ? (
              <a
                href={versionInfo.release_url || '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-green-900/30 hover:bg-green-900/50 transition-colors"
              >
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shrink-0" />
                <div className="text-xs">
                  <span className="text-green-400 font-medium">v{versionInfo.latest_version} available</span>
                  <span className="text-gray-500 block">Current: v{versionInfo.current_version}</span>
                </div>
              </a>
            ) : (
              <div className="text-xs text-gray-500 px-2">v{versionInfo.current_version}</div>
            )
          )}
        </div>
      )}

      {/* Toggle button */}
      <div className={`border-t border-gray-700 ${collapsed ? 'px-2 py-3' : 'px-3 py-3'}`}>
        <button
          onClick={toggle}
          className={`flex items-center rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors w-full ${
            collapsed ? 'justify-center px-0 py-2' : 'gap-3 px-3 py-2'
          }`}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-5 w-5 shrink-0" />
          ) : (
            <>
              <PanelLeftClose className="h-5 w-5 shrink-0" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
