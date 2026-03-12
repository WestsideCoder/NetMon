// SPDX-License-Identifier: GPL-3.0-or-later
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Monitor, MapPin, Bell, Search, Settings, Shield, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useSidebarStore } from '../../store/sidebarStore';

const nav = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/devices', icon: Monitor, label: 'Devices' },
  { to: '/sites', icon: MapPin, label: 'Sites' },
  { to: '/alerts', icon: Bell, label: 'Alerts' },
  { to: '/discovery', icon: Search, label: 'Discovery' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export default function Sidebar() {
  const { collapsed, toggle } = useSidebarStore();

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
