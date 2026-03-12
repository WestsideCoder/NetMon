// SPDX-License-Identifier: GPL-3.0-or-later
import { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Plus, X, Pencil } from 'lucide-react';
import DeviceTable from '../components/Devices/DeviceTable';
import DeviceDetail from '../components/Devices/DeviceDetail';
import DeviceForm from '../components/Devices/DeviceForm';
import BulkEditForm from '../components/Devices/BulkEditForm';
import SNMPMetricPanel from '../components/SNMP/SNMPMetricPanel';
import DeviceLocationMap from '../components/Devices/DeviceLocationMap';
import SearchFilter from '../components/Common/SearchFilter';
import Pagination from '../components/Common/Pagination';
import LoadingSpinner from '../components/Common/LoadingSpinner';
import { useDevices, useDevice } from '../hooks/useDevices';
import { useDeviceSNMP } from '../hooks/useDeviceSNMP';
import { useWebSocket } from '../hooks/useWebSocket';
import { useRole } from '../hooks/useRole';
import api from '../api/client';
import type { Device, Site } from '../types';

const DEVICE_TYPES = ['ups', 'switch', 'router', 'server', 'camera', 'access_point', 'iot', 'other'];
const STATUS_OPTIONS = ['online', 'warning', 'offline', 'unknown'];

export function DeviceListPage() {
  const { canEdit } = useRole();
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFilter = searchParams.get('status') || '';
  const typeFilter = searchParams.get('type') || '';
  const siteFilter = searchParams.get('site_id') || '';
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editDevice, setEditDevice] = useState<Device | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [sites, setSites] = useState<Site[]>([]);

  useEffect(() => {
    api.get('/api/sites/').then((r) => setSites(r.data)).catch(() => {});
  }, []);

  const filters: Record<string, string> = {};
  if (search) filters.search = search;
  if (statusFilter) filters.status = statusFilter;
  if (typeFilter) filters.device_type = typeFilter;
  if (siteFilter) filters.site_id = siteFilter;
  const { data, loading, reload } = useDevices(page, filters);

  // Auto-refresh every 30s + on WebSocket updates
  useEffect(() => {
    const interval = setInterval(reload, 30000);
    return () => clearInterval(interval);
  }, [reload]);

  const handleWsMessage = useCallback(() => { reload(); }, [reload]);
  useWebSocket(handleWsMessage);

  const handleFormSuccess = () => {
    setShowForm(false);
    setEditDevice(null);
    reload();
  };

  const handleFormCancel = () => {
    setShowForm(false);
    setEditDevice(null);
  };

  const handleEdit = (device: Device) => {
    setEditDevice(device);
    setShowForm(true);
  };

  const handleBulkSuccess = () => {
    setShowBulkEdit(false);
    setSelectedIds(new Set());
    reload();
  };

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next);
    setPage(1);
  };

  const clearFilters = () => {
    setSearchParams({});
    setPage(1);
  };

  const hasFilters = statusFilter || typeFilter || siteFilter;

  const selectClass = 'border rounded-lg px-2.5 py-1.5 text-xs dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Devices</h1>
        {canEdit && (
          <button onClick={() => { setEditDevice(null); setShowForm(true); }} className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700">
            <Plus className="h-4 w-4" /> Add Device
          </button>
        )}
      </div>
      {showForm && (
        <DeviceForm
          device={editDevice || undefined}
          onSuccess={handleFormSuccess}
          onCancel={handleFormCancel}
        />
      )}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
        {/* Search + Filters bar */}
        <div className="p-4 border-b dark:border-gray-700 space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <SearchFilter onSearch={setSearch} placeholder="Search devices..." />
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <select
              value={statusFilter}
              onChange={(e) => setFilter('status', e.target.value)}
              className={selectClass}
            >
              <option value="">All Statuses</option>
              {STATUS_OPTIONS.map(s => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
            <select
              value={typeFilter}
              onChange={(e) => setFilter('type', e.target.value)}
              className={selectClass}
            >
              <option value="">All Types</option>
              {DEVICE_TYPES.map(t => (
                <option key={t} value={t}>{t.replace('_', ' ')}</option>
              ))}
            </select>
            <select
              value={siteFilter}
              onChange={(e) => setFilter('site_id', e.target.value)}
              className={selectClass}
            >
              <option value="">All Sites</option>
              {sites.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-full bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                Clear Filters
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        {/* Bulk action bar */}
        {canEdit && selectedIds.size > 0 && (
          <div className="px-4 py-2 bg-blue-50 dark:bg-blue-900/20 border-b dark:border-gray-700 flex items-center justify-between">
            <span className="text-sm text-blue-700 dark:text-blue-300 font-medium">
              {selectedIds.size} device{selectedIds.size !== 1 ? 's' : ''} selected
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowBulkEdit(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
              >
                <Pencil className="h-3.5 w-3.5" /> Bulk Edit
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 border rounded-lg hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700"
              >
                Clear Selection
              </button>
            </div>
          </div>
        )}

        {loading ? <LoadingSpinner /> : data && (
          <>
            <DeviceTable
              devices={data.items}
              onEdit={canEdit ? handleEdit : undefined}
              onDelete={reload}
              selectedIds={selectedIds}
              onSelectionChange={canEdit ? setSelectedIds : undefined}
            />
            <Pagination page={data.page} total={data.total} perPage={data.per_page} onPageChange={setPage} />
          </>
        )}
      </div>

      {showBulkEdit && (
        <BulkEditForm
          count={selectedIds.size}
          ids={Array.from(selectedIds)}
          sites={sites}
          onSuccess={handleBulkSuccess}
          onCancel={() => setShowBulkEdit(false)}
        />
      )}
    </div>
  );
}

export function DeviceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const deviceId = Number(id);
  const { device, loading, reload } = useDevice(deviceId);
  const { data: snmpData } = useDeviceSNMP(deviceId);
  const [editing, setEditing] = useState(false);

  if (loading) return <LoadingSpinner />;
  if (!device) return <p className="text-gray-500">Device not found</p>;

  return (
    <div className="space-y-4">
      {editing ? (
        <DeviceForm
          device={device}
          onSuccess={() => { setEditing(false); reload(); }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <>
          <DeviceDetail device={device} onEdit={() => setEditing(true)} onReload={reload} />
        </>
      )}
      {device.snmp_enabled && snmpData && <SNMPMetricPanel data={snmpData} />}
      {!editing && <DeviceLocationMap device={device} />}
    </div>
  );
}
