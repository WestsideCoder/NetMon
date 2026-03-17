// SPDX-License-Identifier: GPL-3.0-or-later
import { useState, useEffect, useCallback } from 'react';
import { ChevronRight, ChevronDown, MapPin, Image } from 'lucide-react';
import api from '../../api/client';
import type { SiteTree } from '../../types';

const STORAGE_KEY = 'site-tree-expanded';

function loadExpanded(): Set<number> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) return new Set(JSON.parse(raw));
  } catch { /* empty */ }
  return new Set();
}

function saveExpanded(ids: Set<number>) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
}

interface NodeProps {
  site: SiteTree;
  onSelect: (id: number) => void;
  selectedId: number | null;
  expandedIds: Set<number>;
  onToggle: (id: number) => void;
}

function SiteNode({ site, onSelect, selectedId, expandedIds, onToggle }: NodeProps) {
  const open = expandedIds.has(site.id);
  const isSelected = site.id === selectedId;

  return (
    <div>
      <div
        className={`flex items-center gap-1 py-1.5 px-2 rounded cursor-pointer ${isSelected ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}
        onClick={() => onSelect(site.id)}
      >
        {site.children.length > 0 ? (
          <button onClick={(e) => { e.stopPropagation(); onToggle(site.id); }} className="p-0.5">
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        ) : <span className="w-5" />}
        {site.map_image_url ? (
          <Image className={`h-4 w-4 ${isSelected ? 'text-blue-500' : 'text-green-500'}`} />
        ) : (
          <MapPin className={`h-4 w-4 ${isSelected ? 'text-blue-500' : site.device_stats?.offline > 0 ? 'text-red-500' : site.device_stats?.warning > 0 ? 'text-yellow-500' : 'text-gray-400'}`} />
        )}
        <span className={`text-sm ${site.device_stats?.offline > 0 ? 'text-red-600 dark:text-red-400 font-medium' : site.device_stats?.warning > 0 ? 'text-yellow-600 dark:text-yellow-400 font-medium' : ''}`}>{site.name}</span>
        {site.location && <span className="text-xs text-gray-400 ml-1">({site.location})</span>}
        <span className={`text-xs ml-auto ${site.device_stats?.offline > 0 ? 'text-red-500' : site.device_stats?.warning > 0 ? 'text-yellow-500' : 'text-gray-400'}`}>{site.device_count}</span>
      </div>
      {open && site.children.map((c) => (
        <div key={c.id} className="ml-4 border-l dark:border-gray-700 pl-1">
          <SiteNode site={c} onSelect={onSelect} selectedId={selectedId} expandedIds={expandedIds} onToggle={onToggle} />
        </div>
      ))}
    </div>
  );
}

interface Props {
  onSelect: (id: number) => void;
  selectedId?: number | null;
  onTreeLoaded?: (tree: SiteTree[]) => void;
}

export default function SiteTreeView({ onSelect, selectedId = null, onTreeLoaded }: Props) {
  const [tree, setTree] = useState<SiteTree[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(() => loadExpanded());

  useEffect(() => {
    api.get('/api/sites/tree').then((r) => {
      setTree(r.data);
      onTreeLoaded?.(r.data);
    }).catch(() => {});
  }, []);

  const handleToggle = useCallback((id: number) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      saveExpanded(next);
      return next;
    });
  }, []);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Site Hierarchy</h3>
      {tree.map((s) => <SiteNode key={s.id} site={s} onSelect={onSelect} selectedId={selectedId} expandedIds={expandedIds} onToggle={handleToggle} />)}
      {tree.length === 0 && <p className="text-sm text-gray-400">No sites configured</p>}
    </div>
  );
}
