"use client";

import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Images, Plus, Trash2, X } from "lucide-react";
import Image from "next/image";
import { AppShell } from "@/components/app-shell";
import { BrowserFolder, FolderBrowser } from "@/components/folder-browser";
import { api } from "@/lib/api";
import { useLanguage } from "@/lib/i18n";

type Photo = {
  id: string;
  photo_date: string;
  month: string;
  folder_id: string | null;
  title: string | null;
  note: string | null;
  size_bytes: number;
  created_at: string;
};
type SessionPayload = { user: { role: string } };

export default function PhotosPage() {
  const qc = useQueryClient();
  const { tr, dateLocale } = useLanguage();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [folderId, setFolderId] = useState("");
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [viewer, setViewer] = useState<Photo | null>(null);

  const me = useQuery({ queryKey: ["me"], queryFn: () => api<SessionPayload>("/api/auth/me") });
  const canEdit = !!me.data?.user.role && me.data.user.role !== "DOCTOR";
  const query = useQuery({ queryKey: ["photos"], queryFn: () => api<Photo[]>("/api/photos") });
  const folders = useQuery({
    queryKey: ["photo-folders"],
    queryFn: () => api<BrowserFolder[]>("/api/photo-folders")
  });

  const upload = useMutation({
    mutationFn: async () => {
      if (!file || !date) throw new Error(tr("Выберите изображение и дату", "Choose an image and date"));
      const fd = new FormData();
      fd.set("file", file);
      fd.set("photo_date", date);
      if (folderId) fd.set("folder_id", folderId);
      if (title) fd.set("title", title);
      if (note) fd.set("note", note);
      return api<Photo>("/api/photos", { method: "POST", body: fd });
    },
    onSuccess: () => {
      setOpen(false);
      setFile(null);
      setDate(new Date().toISOString().slice(0, 10));
      setTitle("");
      setNote("");
      qc.invalidateQueries({ queryKey: ["photos"] });
      qc.invalidateQueries({ queryKey: ["photo-folders"] });
    }
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/photos/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["photos"] }); qc.invalidateQueries({ queryKey: ["photo-folders"] }); }
  });
  const createFolder = useMutation({
    mutationFn: async ({name, parentId}:{name:string;parentId:string|null}) => {
      const fd = new FormData();
      fd.set("name", name);
      if (parentId) fd.set("parent_id", parentId);
      return api<BrowserFolder>("/api/photo-folders", { method: "POST", body: fd });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["photo-folders"] })
  });
  const renameFolder = useMutation({
    mutationFn: async ({id,name}:{id:string;name:string}) => { const fd=new FormData(); fd.set("name",name); return api(`/api/photo-folders/${id}`,{method:"PUT",body:fd}); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["photo-folders"] })
  });
  const deleteFolder = useMutation({
    mutationFn: (id:string) => api(`/api/photo-folders/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["photo-folders"] }); qc.invalidateQueries({ queryKey: ["photos"] }); }
  });
  const movePhoto = useMutation({
    mutationFn: async ({id,target}:{id:string;target:string}) => { const fd=new FormData(); if(target)fd.set("folder_id",target); return api(`/api/photos/${id}/folder`,{method:"PUT",body:fd}); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["photos"] }); qc.invalidateQueries({ queryKey: ["photo-folders"] }); }
  });

  const visible = useMemo(
    () => (query.data ?? []).filter((photo) => photo.folder_id === currentFolder),
    [query.data, currentFolder]
  );

  const folderPath = (folder: BrowserFolder) => {
    const parts=[folder.name]; let parent=folder.parent_id; const seen=new Set<string>();
    while(parent && !seen.has(parent)){seen.add(parent);const row=folders.data?.find(x=>x.id===parent);if(!row)break;parts.unshift(row.name);parent=row.parent_id;}
    return parts.join(" / ");
  };

  function submit(event: FormEvent) { event.preventDefault(); upload.mutate(); }

  return <AppShell><div className="page stack" style={{ gap: 20 }}>
    <header className="page-head">
      <div><div className="eyebrow">{tr("Фото", "Photos")}</div><h1>{tr("Галерея прогресса", "Progress gallery")}</h1></div>
      {canEdit&&<button className="btn" onClick={() => { setFolderId(currentFolder??""); setOpen((value) => !value); }}><Plus size={17}/>{tr("Добавить фото", "Add photo")}</button>}
    </header>

    <FolderBrowser
      folders={folders.data??[]}
      currentId={currentFolder}
      rootLabel={tr("Все папки", "All folders")}
      folderLabel={tr("Папки", "Folders")}
      itemLabel={(count)=>tr(`${count} фото`, `${count} photos`)}
      createLabel={tr("Создать", "Create")}
      collapseLabel={tr("Свернуть папки", "Collapse folders")}
      expandLabel={tr("Показать папки", "Show folders")}
      renameLabel={tr("Переименовать папку", "Rename folder")}
      deleteLabel={tr("Удалить папку", "Delete folder")}
      emptyLabel={tr("В этой папке нет вложенных папок.", "There are no subfolders here.")}
      onNavigate={setCurrentFolder}
      onCreate={(name,parentId)=>createFolder.mutate({name,parentId})}
      onRename={(id,name)=>renameFolder.mutate({id,name})}
      onDelete={(id)=>deleteFolder.mutate(id)}
      readOnly={!canEdit}
    />

    {open && canEdit && <form className="card section stack" onSubmit={submit}>
      <h2>{tr("Добавить фото прогресса", "Add progress photo")}</h2>
      <div className="form-grid">
        <div className="field"><label htmlFor="photo-file">{tr("Изображение", "Image")}</label><input id="photo-file" className="input" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" onChange={(event)=>setFile(event.target.files?.[0]??null)} required/></div>
        <div className="field"><label htmlFor="photo-date">{tr("Дата", "Date")}</label><input id="photo-date" className="input" type="date" value={date} onChange={(event)=>setDate(event.target.value)} required/></div>
        <div className="field"><label htmlFor="photo-folder">{tr("Папка", "Folder")}</label><select id="photo-folder" className="select" value={folderId} onChange={(event)=>setFolderId(event.target.value)}><option value="">{tr("Корень / без папки", "Root / unfiled")}</option>{folders.data?.map((folder)=><option key={folder.id} value={folder.id}>{folderPath(folder)}</option>)}</select></div>
        <div className="field"><label htmlFor="photo-title">{tr("Название", "Title")} <span className="muted">{tr("необязательно", "optional")}</span></label><input id="photo-title" className="input" value={title} onChange={(event)=>setTitle(event.target.value)}/></div>
      </div>
      <div className="field"><label htmlFor="photo-note">{tr("Описание", "Description")}</label><textarea id="photo-note" className="textarea" value={note} onChange={(event)=>setNote(event.target.value)} placeholder={tr("Любые заметки о фото", "Any notes about this photo")}/></div>
      <div className="notice">{tr("При загрузке геолокация и EXIF-метаданные удаляются. Оригинал хранится приватно.", "Location and EXIF metadata are removed on upload. The original stays private.")}</div>
      {upload.error && <div className="error">{upload.error.message}</div>}
      <div className="form-actions"><button type="button" className="btn secondary" onClick={()=>setOpen(false)}>{tr("Отмена", "Cancel")}</button><button className="btn" disabled={upload.isPending}>{upload.isPending?tr("Обработка…", "Processing…"):tr("Сохранить фото", "Save photo")}</button></div>
    </form>}

    {query.isLoading && <div className="skeleton" style={{height:300}}/>}
    {query.error && <div className="error">{query.error.message}</div>}
    {visible.length>0?<div className="gallery">{visible.map((photo)=><article className="card photo" key={photo.id}>
      <button onClick={()=>setViewer(photo)} className="photo-open" aria-label={tr("Открыть фото", "Open photo")}><Image unoptimized width={900} height={675} src={`/api/photos/${photo.id}/thumbnail`} alt={photo.title||tr("Фото прогресса", "Progress photo")}/></button>
      <div className="photo-meta stack" style={{gap:9}}><div className="row between"><div style={{minWidth:0}}><strong className="truncate-block">{photo.title||tr("Фото прогресса", "Progress photo")}</strong><div className="muted small" style={{marginTop:3}}>{new Date(`${photo.photo_date}T12:00:00`).toLocaleDateString(dateLocale)}</div></div>{canEdit&&<button className="btn danger icon-btn" aria-label={tr("Удалить фото", "Delete photo")} onClick={()=>{if(confirm(tr("Удалить это фото без возможности восстановления?", "Delete this photo permanently?")))remove.mutate(photo.id)}}><Trash2 size={16}/></button>}</div>
      {canEdit&&<select className="select compact-select" value={photo.folder_id??""} onChange={(e)=>movePhoto.mutate({id:photo.id,target:e.target.value})}><option value="">{tr("Корень / без папки", "Root / unfiled")}</option>{folders.data?.map(folder=><option key={folder.id} value={folder.id}>{folderPath(folder)}</option>)}</select>}
      {photo.note&&<p className="muted small" style={{margin:0,whiteSpace:"pre-wrap"}}>{photo.note}</p>}
      </div>
    </article>)}</div>:!query.isLoading&&<div className="card empty"><Images size={28} style={{marginBottom:8}}/><div>{tr("В этой папке пока нет фотографий.", "There are no photos in this folder yet.")}</div></div>}

    {viewer && <div role="dialog" aria-modal="true" aria-label={tr("Просмотр фото", "Progress photo")} onClick={()=>setViewer(null)} className="photo-viewer"><button className="btn secondary icon-btn photo-viewer-close" onClick={()=>setViewer(null)} aria-label={tr("Закрыть", "Close")}><X size={18}/></button><Image unoptimized width={1400} height={1050} onClick={(event)=>event.stopPropagation()} src={`/api/photos/${viewer.id}/content`} alt={viewer.title||tr("Фото прогресса", "Progress photo")} className="photo-viewer-image"/></div>}
  </div></AppShell>;
}
