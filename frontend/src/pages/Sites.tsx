// SPDX-License-Identifier: GPL-3.0-or-later
import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { Plus } from 'lucide-react';
import SiteTreeView from '../components/Sites/SiteTree';
import SiteForm from '../components/Sites/SiteForm';
import SiteMapPanel from '../components/Sites/SiteMapPanel';
import RootMapViewer from '../components/Sites/RootMapViewer';
import ConfirmDialog from '../components/Common/ConfirmDialog';
import { useRole } from '../hooks/useRole';
import { useWebSocket } from '../hooks/useWebSocket';
import api from '../api/client';
import type { Site, SiteTree } from '../types';

export default function Sites() {
  const { canEdit } = useRole();
  const location = useLocation();
  const [showForm, setShowForm] = useState(false);
  const [editSite, setEditSite] = useState<Site | null>(null);
  const [addChildParentId, setAddChildParentId] = useState<number | null>(null);
  const [selectedId, setSelectedIdState] = useState<number | null>(() => {
    const navState = location.state as { selectSiteId?: number } | null;
    if (navState?.selectSiteId != null) return navState.selectSiteId;
    const saved = sessionStorage.getItem('site-selected-id');
    return saved ? Number(saved) : null;
  });
  const setSelectedId = useCallback((id: number | null) => {
    setSelectedIdState(id);
    if (id != null) {
      sessionStorage.setItem('site-selected-id', String(id));
    } else {
      sessionStorage.removeItem('site-selected-id');
    }
  }, []);

  // Clear navigation state after consuming it so refresh / back‑button
  // doesn't re‑select a child site instead of showing the root map.
  useEffect(() => {
    if (location.state) {
      window.history.replaceState({}, '');
    }
  }, []);

  // Auto‑select the only root site so the user lands on the site panel
  // (with edit buttons) instead of the overview map layer.
  const handleTreeLoaded = useCallback((tree: SiteTree[]) => {
    if (tree.length === 1 && !selectedId) {
      setSelectedId(tree[0].id);
    }
  }, [selectedId]);

  const [selectedSite, setSelectedSite] = useState<Site | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Site | null>(null);
  const [treeKey, setTreeKey] = useState(0);

  const reload = useCallback(() => {
    setTreeKey((k) => k + 1);
  }, []);

  // Auto-refresh every 30s + on WebSocket updates
  useEffect(() => {
    const interval = setInterval(reload, 30000);
    return () => clearInterval(interval);
  }, [reload]);

  const handleWsMessage = useCallback(() => { reload(); }, [reload]);
  useWebSocket(handleWsMessage);

  // Load full site details when selected
  useEffect(() => {
    if (!selectedId) { setSelectedSite(null); return; }
    api.get(`/api/sites/${selectedId}`)
      .then((r) => setSelectedSite(r.data))
      .catch(() => setSelectedSite(null));
  }, [selectedId, treeKey]);

  const handleFormSuccess = () => {
    setShowForm(false);
    setEditSite(null);
    setAddChildParentId(null);
    reload();
  };

  const handleFormCancel = () => {
    setShowForm(false);
    setEditSite(null);
    setAddChildParentId(null);
  };

  const openEdit = () => {
    if (selectedSite) {
      setEditSite(selectedSite);
      setAddChildParentId(null);
      setShowForm(true);
    }
  };

  const openAddChild = () => {
    if (selectedSite) {
      setEditSite(null);
      setAddChildParentId(selectedSite.id);
      setShowForm(true);
    }
  };

  const openAdd = () => {
    setEditSite(null);
    setAddChildParentId(null);
    setShowForm(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/api/sites/${deleteTarget.id}`);
      if (selectedId === deleteTarget.id) {
        setSelectedId(null);
        setSelectedSite(null);
      }
      setDeleteTarget(null);
      reload();
    } catch {
      setDeleteTarget(null);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)]">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-lg font-bold text-gray-900 dark:text-white">Sites</h1>
        {canEdit && (
          <button onClick={openAdd} className="flex items-center gap-1.5 px-3 py-1 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700">
            <Plus className="h-3.5 w-3.5" /> Add Site
          </button>
        )}
      </div>

      <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">
        {/* Tree */}
        <div className="lg:w-[19%] lg:shrink-0 overflow-y-auto">
          <SiteTreeView key={treeKey} onSelect={setSelectedId} selectedId={selectedId} onTreeLoaded={handleTreeLoaded} />
        </div>

        {/* Map panel */}
        <div className="flex-1 min-w-0 overflow-y-auto">
          {selectedSite ? (
            <SiteMapPanel
              site={selectedSite}
              onEdit={openEdit}
              onDelete={() => setDeleteTarget(selectedSite)}
              onAddChild={openAddChild}
              onReload={reload}
            />
          ) : (
            <RootMapViewer onSelectSite={(id) => setSelectedId(id)} />
          )}
        </div>
      </div>

      {/* Form modal */}
      {showForm && (
        <SiteForm
          site={editSite}
          parentId={addChildParentId}
          onSuccess={handleFormSuccess}
          onCancel={handleFormCancel}
        />
      )}

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Site"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? Devices in this site will need to be reassigned.`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
