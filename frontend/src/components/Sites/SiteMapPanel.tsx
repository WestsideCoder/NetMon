// SPDX-License-Identifier: GPL-3.0-or-later
import { useState, useEffect, useCallback } from 'react';
import { Pencil, Trash2, FolderPlus, Image, MapPin, ChevronDown, ChevronUp, ImageOff, Plus } from 'lucide-react';
import api from '../../api/client';
import type { Site, SiteChildWithStats } from '../../types';
import { formatDate } from '../../utils/date';
import { useRole } from '../../hooks/useRole';
import SiteBreadcrumb from './SiteBreadcrumb';
import SiteChildGrid from './SiteChildGrid';
import FloorPlanViewer from './FloorPlanViewer';
import MapImageUpload from './MapImageUpload';
import DeviceForm from '../Devices/DeviceForm';

interface Props {
  site: Site;
  onEdit: () => void;
  onDelete: () => void;
  onAddChild: () => void;
  onReload: () => void;
}

export default function SiteMapPanel({ site, onEdit, onDelete, onAddChild, onReload }: Props) {
  const [navStack, setNavStack] = useState<Site[]>([site]);
  const [children, setChildren] = useState<SiteChildWithStats[]>([]);
  const [childrenLoading, setChildrenLoading] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showAddDevice, setShowAddDevice] = useState(false);
  const { canEdit, isAdmin } = useRole();

  const currentSite = navStack[navStack.length - 1];

  // When externally-selected site changes, reset nav stack
  useEffect(() => {
    setNavStack([site]);
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

      {/* Content: floor plan viewer for sites with map images, child grid for non-floor levels */}
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
