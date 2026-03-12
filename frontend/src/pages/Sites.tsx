// SPDX-License-Identifier: GPL-3.0-or-later
import { useState, useEffect, useCallback } from 'react';
import { Plus } from 'lucide-react';
import SiteTreeView from '../components/Sites/SiteTree';
import SiteForm from '../components/Sites/SiteForm';
import SiteMapPanel from '../components/Sites/SiteMapPanel';
import RootMapViewer from '../components/Sites/RootMapViewer';
import ConfirmDialog from '../components/Common/ConfirmDialog';
import { useRole } from '../hooks/useRole';
import api from '../api/client';
import type { Site } from '../types';

export default function Sites() {
  const { canEdit } = useRole();
  const [showForm, setShowForm] = useState(false);
  const [editSite, setEditSite] = useState<Site | null>(null);
  const [addChildParentId, setAddChildParentId] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedSite, setSelectedSite] = useState<Site | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Site | null>(null);
  const [treeKey, setTreeKey] = useState(0);

  const reload = useCallback(() => {
    setTreeKey((k) => k + 1);
  }, []);

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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Sites</h1>
        {canEdit && (
          <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
            <Plus className="h-4 w-4" /> Add Site
          </button>
        )}
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Tree */}
        <div className="lg:w-[19%] lg:shrink-0">
          <SiteTreeView key={treeKey} onSelect={setSelectedId} selectedId={selectedId} />
        </div>

        {/* Map panel */}
        <div className="flex-1 min-w-0">
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
