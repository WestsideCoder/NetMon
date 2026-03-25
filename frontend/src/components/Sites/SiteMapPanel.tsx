// SPDX-License-Identifier: GPL-3.0-or-later
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pencil, Trash2, FolderPlus, Image, MapPin, ChevronDown, ChevronUp, ImageOff, Plus, Radar, Map, List, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import type { Site, Device, SiteChildWithStats } from '../../types';
import { formatDate } from '../../utils/date';
import { useRole } from '../../hooks/useRole';
import SiteBreadcrumb from './SiteBreadcrumb';
import SiteChildGrid from './SiteChildGrid';
import FloorPlanViewer from './FloorPlanViewer';
import MapImageUpload from './MapImageUpload';
import DeviceForm from '../Devices/DeviceForm';

type SortDir = 'asc' | 'desc';
type SiteSortKey = 'name' | 'location' | 'level' | 'total' | 'online' | 'offline';
type DeviceSortKey = 'status' | 'name' | 'ip_address' | 'device_type' | 'response_time' | 'uptime_percentage';

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />;
  return dir === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />;
}

function SortHeader<K extends string>({ label, sortKey, currentKey, dir, onSort }: {
  label: string; sortKey: K; currentKey: K | null; dir: SortDir; onSort: (key: K) => void;
}) {
  return (
    <th
      className="px-4 py-2 font-medium text-gray-600 dark:text-gray-300 cursor-pointer select-none hover:text-gray-900 dark:hover:text-white"
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <SortIcon active={currentKey === sortKey} dir={dir} />
      </span>
    </th>
  );
}

interface Props {
  site: Site;
  onEdit: () => void;
  onDelete: () => void;
  onAddChild: () => void;
  onReload: () => void;
}

const NAV_STACK_KEY = 'site-nav-stack';

function saveNavStackIds(stack: Site[]) {
  sessionStorage.setItem(NAV_STACK_KEY, JSON.stringify(stack.map(s => s.id)));
}

function loadNavStackIds(): number[] {
  try {
    const raw = sessionStorage.getItem(NAV_STACK_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* empty */ }
  return [];
}

export default function SiteMapPanel({ site, onEdit, onDelete, onAddChild, onReload }: Props) {
  const navigate = useNavigate();
  const [navStack, setNavStackState] = useState<Site[]>([site]);
  const [navRestored, setNavRestored] = useState(false);
  const [children, setChildren] = useState<SiteChildWithStats[]>([]);
  const [childrenLoading, setChildrenLoading] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showAddDevice, setShowAddDevice] = useState(false);
  const [viewMode, setViewModeState] = useState<'map' | 'list'>(() => {
    return (localStorage.getItem('site-view-mode') as 'map' | 'list') || 'map';
  });
  const setViewMode = (mode: 'map' | 'list') => {
    setViewModeState(mode);
    localStorage.setItem('site-view-mode', mode);
  };
  const [listDevices, setListDevices] = useState<Device[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [siteSortKey, setSiteSortKey] = useState<SiteSortKey | null>(null);
  const [siteSortDir, setSiteSortDir] = useState<SortDir>('asc');
  const [deviceSortKey, setDeviceSortKey] = useState<DeviceSortKey | null>(null);
  const [deviceSortDir, setDeviceSortDir] = useState<SortDir>('asc');
  const { canEdit, isAdmin } = useRole();

  const toggleSiteSort = (key: SiteSortKey) => {
    if (siteSortKey === key) setSiteSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSiteSortKey(key); setSiteSortDir('asc'); }
  };
  const toggleDeviceSort = (key: DeviceSortKey) => {
    if (deviceSortKey === key) setDeviceSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setDeviceSortKey(key); setDeviceSortDir('asc'); }
  };

  const sortedChildren = useMemo(() => {
    if (!siteSortKey) return children;
    const m = siteSortDir === 'asc' ? 1 : -1;
    return [...children].sort((a, b) => {
      let av: string | number, bv: string | number;
      switch (siteSortKey) {
        case 'name': av = a.name.toLowerCase(); bv = b.name.toLowerCase(); break;
        case 'location': av = (a.location || '').toLowerCase(); bv = (b.location || '').toLowerCase(); break;
        case 'level': av = a.level; bv = b.level; break;
        case 'total': av = a.device_stats.total; bv = b.device_stats.total; break;
        case 'online': av = a.device_stats.online; bv = b.device_stats.online; break;
        case 'offline': av = a.device_stats.offline; bv = b.device_stats.offline; break;
      }
      return av < bv ? -m : av > bv ? m : 0;
    });
  }, [children, siteSortKey, siteSortDir]);

  const statusOrder: Record<string, number> = { online: 0, warning: 1, offline: 2, unknown: 3 };
  const sortedDevices = useMemo(() => {
    if (!deviceSortKey) return listDevices;
    const m = deviceSortDir === 'asc' ? 1 : -1;
    return [...listDevices].sort((a, b) => {
      let av: string | number, bv: string | number;
      switch (deviceSortKey) {
        case 'status': av = statusOrder[a.status] ?? 9; bv = statusOrder[b.status] ?? 9; break;
        case 'name': av = a.name.toLowerCase(); bv = b.name.toLowerCase(); break;
        case 'ip_address': {
          const toNum = (ip: string) => ip.split('.').reduce((s, o) => s * 256 + Number(o), 0);
          av = toNum(a.ip_address); bv = toNum(b.ip_address); break;
        }
        case 'device_type': av = (a.device_type || '').toLowerCase(); bv = (b.device_type || '').toLowerCase(); break;
        case 'response_time': av = a.response_time ?? Infinity; bv = b.response_time ?? Infinity; break;
        case 'uptime_percentage': av = a.uptime_percentage; bv = b.uptime_percentage; break;
      }
      return av < bv ? -m : av > bv ? m : 0;
    });
  }, [listDevices, deviceSortKey, deviceSortDir]);

  const setNavStack = useCallback((updater: Site[] | ((prev: Site[]) => Site[])) => {
    setNavStackState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      saveNavStackIds(next);
      return next;
    });
  }, []);

  const currentSite = navStack[navStack.length - 1];

  // When externally-selected site changes, restore saved nav stack or reset
  useEffect(() => {
    const savedIds = loadNavStackIds();
    // Restore if the saved stack starts with this site and has drill-down entries
    if (savedIds.length > 1 && savedIds[0] === site.id && !navRestored) {
      setNavRestored(true);
      // Fetch all sites in the saved stack
      Promise.all(savedIds.map(id => api.get(`/api/sites/${id}`).then(r => r.data)))
        .then(sites => {
          setNavStackState(sites);
          saveNavStackIds(sites);
        })
        .catch(() => {
          setNavStack([site]);
        });
    } else {
      setNavStack([site]);
      setNavRestored(true);
    }
    setDetailOpen(false);
  }, [site.id]);

  // When the same site is re-fetched (e.g. after map upload), update it in the nav stack
  useEffect(() => {
    setNavStack(prev => {
      if (prev.length === 1) return [site];
      if (prev[0].id === site.id) return [site, ...prev.slice(1)];
      return prev;
    });
  }, [site.map_image_url, site.name, site.device_count]);

  // Fetch children when current site changes
  const fetchChildren = useCallback(async () => {
    if (currentSite.level >= 4) return;
    setChildrenLoading(true);
    try {
      const res = await api.get(`/api/sites/${currentSite.id}/children-with-stats`);
      setChildren(res.data);
    } catch {
      setChildren([]);
    }
    setChildrenLoading(false);
  }, [currentSite.id, currentSite.level]);

  useEffect(() => {
    fetchChildren();
  }, [fetchChildren]);

  // Fetch devices for list view
  const fetchListDevices = useCallback(async () => {
    setListLoading(true);
    try {
      const res = await api.get('/api/devices/', { params: { site_id: currentSite.id, per_page: 200 } });
      setListDevices(res.data.items);
    } catch { setListDevices([]); }
    setListLoading(false);
  }, [currentSite.id]);

  useEffect(() => {
    if (viewMode === 'list') fetchListDevices();
  }, [viewMode, fetchListDevices]);

  const handleDrillDown = async (child: SiteChildWithStats) => {
    // Fetch full site details for the child and push onto internal nav stack
    try {
      const res = await api.get(`/api/sites/${child.id}`);
      const childSite: Site = res.data;
      setNavStack(prev => [...prev, childSite]);
    } catch { /* empty */ }
  };

  const handleBreadcrumbNav = (index: number) => {
    setNavStack(prev => prev.slice(0, index + 1));
  };

  const handleUploadSuccess = async () => {
    setShowUpload(false);
    onReload();
    // Re-fetch the current site to get updated map_image_url
    try {
      const res = await api.get(`/api/sites/${currentSite.id}`);
      setNavStack(prev => [...prev.slice(0, -1), res.data]);
    } catch { /* empty */ }
  };

  const handleDeleteImage = async () => {
    try {
      await api.delete(`/api/sites/${currentSite.id}/map-image`);
      onReload();
      const res = await api.get(`/api/sites/${currentSite.id}`);
      setNavStack(prev => [...prev.slice(0, -1), res.data]);
    } catch { /* empty */ }
  };

  const isFloorLevel = currentSite.level >= 4;
  const hasMapImage = !!currentSite.map_image_url;

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      {navStack.length > 1 && (
        <SiteBreadcrumb navStack={navStack} onNavigate={handleBreadcrumbNav} />
      )}

      {/* Header card */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <MapPin className="h-5 w-5 text-blue-500 shrink-0" />
            <div className="min-w-0">
              <h3 className="text-lg font-semibold dark:text-white truncate">{currentSite.name}</h3>
              {currentSite.location && (
                <p className="text-sm text-gray-500 truncate">{currentSite.location}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {canEdit && (
              <>
                {currentSite.map_image_url ? (
                  <button onClick={handleDeleteImage} className="flex items-center gap-1 px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700" title="Remove map image">
                    <ImageOff className="h-4 w-4" />
                  </button>
                ) : null}
                <button onClick={() => setShowUpload(true)} className="flex items-center gap-1 px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700" title="Upload map image">
                  <Image className="h-4 w-4" />
                </button>
                <button onClick={() => setShowAddDevice(true)} className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700" title="Add device to this site">
                  <Plus className="h-4 w-4" /> Add Device
                </button>
                <button onClick={() => navigate(`/discovery?site_id=${currentSite.id}`)} className="flex items-center gap-1 px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700" title="Scan for devices">
                  <Radar className="h-4 w-4" /> Scan
                </button>
                {currentSite.level < 4 && (
                  <button onClick={onAddChild} className="flex items-center gap-1 px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700" title="Add child site">
                    <FolderPlus className="h-4 w-4" />
                  </button>
                )}
                <button onClick={onEdit} className="flex items-center gap-1 px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700" title="Edit site">
                  <Pencil className="h-4 w-4" />
                </button>
              </>
            )}
            {isAdmin && (
              <button onClick={onDelete} className="flex items-center gap-1 px-3 py-1.5 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/30" title="Delete site">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            <div className="flex border rounded-lg dark:border-gray-600 overflow-hidden">
              <button onClick={() => setViewMode('map')} className={`p-1.5 ${viewMode === 'map' ? 'bg-blue-600 text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-300'}`} title="Map view">
                <Map className="h-4 w-4" />
              </button>
              <button onClick={() => setViewMode('list')} className={`p-1.5 ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-300'}`} title="List view">
                <List className="h-4 w-4" />
              </button>
            </div>
            <button onClick={() => setDetailOpen(!detailOpen)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
              {detailOpen ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
            </button>
          </div>
        </div>

        {/* Collapsible details */}
        {detailOpen && (
          <div className="px-5 py-3 border-t dark:border-gray-700 space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Devices</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">{currentSite.device_count}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Level</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">{currentSite.level}</p>
              </div>
            </div>
            {currentSite.description && (
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1">Description</p>
                <p className="text-sm text-gray-700 dark:text-gray-300">{currentSite.description}</p>
              </div>
            )}
            {(currentSite.contact_name || currentSite.contact_email) && (
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1">Contact</p>
                {currentSite.contact_name && <p className="text-sm text-gray-700 dark:text-gray-300">{currentSite.contact_name}</p>}
                {currentSite.contact_email && <p className="text-sm text-blue-600 dark:text-blue-400">{currentSite.contact_email}</p>}
              </div>
            )}
            <div className="text-xs text-gray-400 pt-2 border-t dark:border-gray-700">
              Created: {formatDate(currentSite.created_at)}
              {' | '}
              Updated: {formatDate(currentSite.updated_at)}
            </div>
          </div>
        )}
      </div>

      {/* Content: map view or list view */}
      {viewMode === 'map' ? (
        <>
          {(isFloorLevel || hasMapImage) && (
            <FloorPlanViewer
              site={currentSite}
              children={!isFloorLevel ? children : undefined}
              onUploadImage={() => setShowUpload(true)}
              onReload={() => { onReload(); fetchChildren(); }}
              onDrillDown={handleDrillDown}
            />
          )}
          {!isFloorLevel && (
            <SiteChildGrid
              children={children}
              onSelect={handleDrillDown}
              loading={childrenLoading}
            />
          )}
        </>
      ) : (
        <div className="space-y-4">
          {/* Sub-sites */}
          {!isFloorLevel && children.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 dark:bg-gray-700 border-b dark:border-gray-600">
                <h4 className="text-sm font-medium text-gray-600 dark:text-gray-300">Sub-sites ({children.length})</h4>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50/50 dark:bg-gray-700/50 text-left">
                    <tr>
                      <SortHeader label="Name" sortKey="name" currentKey={siteSortKey} dir={siteSortDir} onSort={toggleSiteSort} />
                      <SortHeader label="Location" sortKey="location" currentKey={siteSortKey} dir={siteSortDir} onSort={toggleSiteSort} />
                      <SortHeader label="Level" sortKey="level" currentKey={siteSortKey} dir={siteSortDir} onSort={toggleSiteSort} />
                      <SortHeader label="Devices" sortKey="total" currentKey={siteSortKey} dir={siteSortDir} onSort={toggleSiteSort} />
                      <SortHeader label="Online" sortKey="online" currentKey={siteSortKey} dir={siteSortDir} onSort={toggleSiteSort} />
                      <SortHeader label="Offline" sortKey="offline" currentKey={siteSortKey} dir={siteSortDir} onSort={toggleSiteSort} />
                    </tr>
                  </thead>
                  <tbody className="divide-y dark:divide-gray-700">
                    {sortedChildren.map((c) => (
                      <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer" onDoubleClick={() => handleDrillDown(c)}>
                        <td className="px-4 py-3">
                          <span className={`hover:underline font-medium flex items-center gap-1.5 ${
                            c.device_stats.offline > 0 ? 'text-red-600 dark:text-red-400' : c.device_stats.warning > 0 ? 'text-yellow-600 dark:text-yellow-400' : 'text-blue-600 dark:text-blue-400'
                          }`}>
                            <FolderPlus className="h-3.5 w-3.5" />
                            {c.name}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{c.location || '—'}</td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{c.level}</td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{c.device_stats.total}</td>
                        <td className="px-4 py-3">
                          <span className="text-green-600 dark:text-green-400">{c.device_stats.online}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={c.device_stats.offline > 0 ? 'text-red-600 dark:text-red-400' : c.device_stats.warning > 0 ? 'text-yellow-600 dark:text-yellow-400' : 'text-gray-600 dark:text-gray-300'}>{c.device_stats.offline}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Devices */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 dark:bg-gray-700 border-b dark:border-gray-600">
              <h4 className="text-sm font-medium text-gray-600 dark:text-gray-300">Devices ({listDevices.length})</h4>
            </div>
            {listLoading ? (
              <div className="p-8 text-center text-gray-500">Loading devices...</div>
            ) : listDevices.length === 0 ? (
              <div className="p-8 text-center text-gray-500">No devices in this site</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50/50 dark:bg-gray-700/50 text-left">
                    <tr>
                      <SortHeader label="Status" sortKey="status" currentKey={deviceSortKey} dir={deviceSortDir} onSort={toggleDeviceSort} />
                      <SortHeader label="Name" sortKey="name" currentKey={deviceSortKey} dir={deviceSortDir} onSort={toggleDeviceSort} />
                      <SortHeader label="IP Address" sortKey="ip_address" currentKey={deviceSortKey} dir={deviceSortDir} onSort={toggleDeviceSort} />
                      <SortHeader label="Type" sortKey="device_type" currentKey={deviceSortKey} dir={deviceSortDir} onSort={toggleDeviceSort} />
                      <SortHeader label="Response" sortKey="response_time" currentKey={deviceSortKey} dir={deviceSortDir} onSort={toggleDeviceSort} />
                      <SortHeader label="Uptime" sortKey="uptime_percentage" currentKey={deviceSortKey} dir={deviceSortDir} onSort={toggleDeviceSort} />
                    </tr>
                  </thead>
                  <tbody className="divide-y dark:divide-gray-700">
                    {sortedDevices.map((d) => (
                      <tr key={d.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td className="px-4 py-3">
                          <span className={`inline-block w-2.5 h-2.5 rounded-full ${
                            d.status === 'online' ? 'bg-green-500' :
                            d.status === 'warning' ? 'bg-yellow-500' :
                            d.status === 'offline' ? 'bg-red-500' :
                            d.status === 'maintenance' ? 'bg-blue-500' : 'bg-gray-400'
                          }`} title={d.status} />
                        </td>
                        <td className="px-4 py-3">
                          <Link to={`/devices/${d.id}`} className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
                            {d.name}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-300 font-mono">{d.ip_address}</td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-300 capitalize">{d.device_type || '—'}</td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{d.response_time != null ? `${d.response_time}ms` : '—'}</td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{d.uptime_percentage.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Upload modal */}
      {showUpload && (
        <MapImageUpload
          siteId={currentSite.id}
          onSuccess={handleUploadSuccess}
          onCancel={() => setShowUpload(false)}
        />
      )}

      {/* Add Device modal */}
      {showAddDevice && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <DeviceForm
              siteId={currentSite.id}
              onSuccess={() => { setShowAddDevice(false); onReload(); fetchChildren(); }}
              onCancel={() => setShowAddDevice(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
