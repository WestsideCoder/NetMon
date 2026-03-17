// SPDX-License-Identifier: GPL-3.0-or-later
import { useState, useEffect } from 'react';
import { Map } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import type { SiteTree } from '../../types';

export default function DashboardMapWidget() {
  const [sites, setSites] = useState<SiteTree[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get('/api/sites/tree');
        const roots = res.data as SiteTree[];
        setSites(roots.slice(0, 4));
      } catch { /* empty */ }
      setLoading(false);
    };
    load();
  }, []);

  if (loading || sites.length === 0) return null;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
      <div className="px-5 py-4 border-b dark:border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Map className="h-5 w-5 text-blue-500" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Site Maps</h2>
        </div>
        <Link to="/sites" className="text-xs text-blue-600 dark:text-blue-400 hover:underline">View All</Link>
      </div>
      <div className="p-5 grid grid-cols-2 lg:grid-cols-4 gap-4">
        {sites.map(site => (
          <Link
            key={site.id}
            to="/sites"
            className={`group block rounded-lg border overflow-hidden hover:ring-2 transition-all ${
              site.device_stats?.offline > 0
                ? 'border-red-300 dark:border-red-700 hover:ring-red-300'
                : site.device_stats?.warning > 0
                ? 'border-yellow-300 dark:border-yellow-700 hover:ring-yellow-300'
                : 'dark:border-gray-700 hover:ring-blue-300'
            }`}
          >
            <div className="h-28 overflow-hidden bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
              {site.map_image_url ? (
                <img
                  src={site.map_image_url}
                  alt={site.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                />
              ) : (
                <Map className="h-10 w-10 text-gray-300 dark:text-gray-600" />
              )}
            </div>
            <div className="px-3 py-2">
              <p className={`text-sm font-medium truncate ${site.device_stats?.offline > 0 ? 'text-red-600 dark:text-red-400' : site.device_stats?.warning > 0 ? 'text-yellow-600 dark:text-yellow-400' : 'dark:text-white'}`}>{site.name}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{site.device_count} device{site.device_count !== 1 ? 's' : ''}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
