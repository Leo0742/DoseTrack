"use client";

import { ChevronDown, ChevronLeft, ChevronRight, Folder, FolderOpen, FolderPlus, Pencil, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

export type BrowserFolder = {
  id: string;
  name: string;
  parent_id: string | null;
  item_count: number;
  child_count: number;
};

type Props = {
  folders: BrowserFolder[];
  currentId: string | null;
  rootLabel: string;
  folderLabel: string;
  itemLabel: (count: number) => string;
  createLabel: string;
  collapseLabel: string;
  expandLabel: string;
  renameLabel: string;
  deleteLabel: string;
  emptyLabel: string;
  onNavigate: (id: string | null) => void;
  onCreate: (name: string, parentId: string | null) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  readOnly?: boolean;
};

export function FolderBrowser({
  folders,
  currentId,
  rootLabel,
  folderLabel,
  itemLabel,
  createLabel,
  collapseLabel,
  expandLabel,
  renameLabel,
  deleteLabel,
  emptyLabel,
  onNavigate,
  onCreate,
  onRename,
  onDelete,
  readOnly = false,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [newName, setNewName] = useState("");

  const children = useMemo(
    () => folders.filter((folder) => folder.parent_id === currentId),
    [folders, currentId],
  );

  const breadcrumb = useMemo(() => {
    const path: BrowserFolder[] = [];
    let id = currentId;
    const seen = new Set<string>();
    while (id && !seen.has(id)) {
      seen.add(id);
      const folder = folders.find((item) => item.id === id);
      if (!folder) break;
      path.unshift(folder);
      id = folder.parent_id;
    }
    return path;
  }, [folders, currentId]);

  const current = currentId ? folders.find((folder) => folder.id === currentId) ?? null : null;

  return (
    <section className="card section stack folder-browser">
      <div className="folder-browser-head">
        <div className="folder-breadcrumb" aria-label={folderLabel}>
          <button className="folder-crumb" onClick={() => onNavigate(null)}>{rootLabel}</button>
          {breadcrumb.map((folder) => (
            <span className="folder-crumb-group" key={folder.id}>
              <ChevronRight size={14}/>
              <button className="folder-crumb" onClick={() => onNavigate(folder.id)}>{folder.name}</button>
            </span>
          ))}
        </div>
        <button className="btn secondary compact-btn" onClick={() => setCollapsed((value) => !value)}>
          <ChevronDown className={collapsed ? "folder-chevron collapsed" : "folder-chevron"} size={16}/>
          {collapsed ? expandLabel : collapseLabel}
        </button>
      </div>

      {!collapsed && <>
        <div className="folder-browser-toolbar">
          <div className="folder-location">
            {current && <button className="btn secondary icon-btn" aria-label={rootLabel} onClick={() => onNavigate(current.parent_id)}><ChevronLeft size={17}/></button>}
            <div><div className="section-kicker">{folderLabel}</div><h2>{current?.name ?? rootLabel}</h2></div>
          </div>
          {!readOnly && <div className="folder-create">
            <input className="input" value={newName} onChange={(event) => setNewName(event.target.value)} placeholder={folderLabel}/>
            <button className="btn secondary" disabled={!newName.trim()} onClick={() => { onCreate(newName.trim(), currentId); setNewName(""); }}><FolderPlus size={16}/>{createLabel}</button>
          </div>}
        </div>

        {children.length > 0 ? <div className="folder-grid">
          {children.map((folder) => (
            <article className="folder-card" key={folder.id}>
              <button className="folder-card-open" onClick={() => onNavigate(folder.id)}>
                <span className="folder-card-icon">{folder.child_count || folder.item_count ? <FolderOpen size={27}/> : <Folder size={27}/>}</span>
                <span className="folder-card-copy"><strong>{folder.name}</strong><small>{itemLabel(folder.item_count)}{folder.child_count ? ` · ${folder.child_count} ${folderLabel.toLowerCase()}` : ""}</small></span>
              </button>
              {!readOnly && <div className="folder-card-actions">
                <button className="icon-plain" title={renameLabel} aria-label={renameLabel} onClick={() => { const name = window.prompt(renameLabel, folder.name); if (name?.trim() && name.trim() !== folder.name) onRename(folder.id, name.trim()); }}><Pencil size={15}/></button>
                <button className="icon-plain danger-text" title={deleteLabel} aria-label={deleteLabel} onClick={() => { if (window.confirm(`${deleteLabel}: ${folder.name}?`)) onDelete(folder.id); }}><Trash2 size={15}/></button>
              </div>}
            </article>
          ))}
        </div> : <div className="folder-empty">{emptyLabel}</div>}
      </>}
    </section>
  );
}
