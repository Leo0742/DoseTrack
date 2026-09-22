"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Plus, Search, Trash2, X } from "lucide-react";
import Image from "next/image";
import { AppShell } from "@/components/app-shell";
import { BrowserFolder, FolderBrowser } from "@/components/folder-browser";
import { api } from "@/lib/api";
import { useLanguage } from "@/lib/i18n";

type Category = { id: string; name: string };
type SessionPayload = { user: { role: string } };
type Doc = {
  id: string;
  title: string;
  original_filename: string;
  category_id: string | null;
  folder_id: string | null;
  document_date: string | null;
  mime_type: string;
  size_bytes: number;
  checksum_sha256: string;
  note: string | null;
  created_at: string;
};

export default function DocumentsPage() {
  const qc = useQueryClient();
  const { tr } = useLanguage();
  const [openUpload, setOpenUpload] = useState(false);
  const [preview, setPreview] = useState<Doc | null>(null);
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [folderId, setFolderId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [q, setQ] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [newCategory, setNewCategory] = useState("");

  const me = useQuery({ queryKey: ["me"], queryFn: () => api<SessionPayload>("/api/auth/me") });
  const canEdit = !!me.data?.user.role && me.data.user.role !== "DOCTOR";
  const categories = useQuery({
    queryKey: ["document-categories"],
    queryFn: () => api<Category[]>("/api/document-categories")
  });
  const folders = useQuery({
    queryKey: ["document-folders"],
    queryFn: () => api<BrowserFolder[]>("/api/document-folders")
  });
  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (filterCategory) p.set("category_id", filterCategory);
    return p.toString();
  }, [q, filterCategory]);
  const query = useQuery({
    queryKey: ["documents", params],
    queryFn: () => api<Doc[]>(`/api/documents${params ? `?${params}` : ""}`)
  });
  const visibleDocs = useMemo(
    () => (query.data ?? []).filter((doc) => doc.folder_id === currentFolder),
    [query.data, currentFolder]
  );

  useEffect(() => {
    if (!query.data) return;
    const id = new URLSearchParams(window.location.search).get("open");
    if (id) {
      const doc=query.data.find((item) => item.id === id) ?? null;
      setPreview(doc);
      if(doc) setCurrentFolder(doc.folder_id);
    }
  }, [query.data]);

  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error(tr("Выберите файл", "Choose a file"));
      const fd = new FormData();
      fd.set("file", file);
      fd.set("title", title || file.name);
      if (date) fd.set("document_date", date);
      if (note) fd.set("note", note);
      if (categoryId) fd.set("category_id", categoryId);
      if (folderId) fd.set("folder_id", folderId);
      return api<Doc>("/api/documents", { method: "POST", body: fd });
    },
    onSuccess: () => {
      setOpenUpload(false); setFile(null); setTitle(""); setDate(""); setNote(""); setCategoryId("");
      qc.invalidateQueries({ queryKey: ["documents"] });
      qc.invalidateQueries({ queryKey: ["document-folders"] });
    }
  });
  const remove = useMutation({ mutationFn: (id: string) => api(`/api/documents/${id}`, { method: "DELETE" }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["documents"] }); qc.invalidateQueries({ queryKey: ["document-folders"] }); } });
  const createCategory = useMutation({
    mutationFn: async () => { const fd = new FormData(); fd.set("name", newCategory); return api<Category>("/api/document-categories", { method: "POST", body: fd }); },
    onSuccess: (created) => { setNewCategory(""); setCategoryId(created.id); qc.invalidateQueries({ queryKey: ["document-categories"] }); }
  });
  const createFolder = useMutation({
    mutationFn: async ({name,parentId}:{name:string;parentId:string|null}) => { const fd=new FormData();fd.set("name",name);if(parentId)fd.set("parent_id",parentId);return api<BrowserFolder>("/api/document-folders",{method:"POST",body:fd}); },
    onSuccess:()=>qc.invalidateQueries({queryKey:["document-folders"]})
  });
  const renameFolder = useMutation({
    mutationFn:async({id,name}:{id:string;name:string})=>{const fd=new FormData();fd.set("name",name);return api(`/api/document-folders/${id}`,{method:"PUT",body:fd});},
    onSuccess:()=>qc.invalidateQueries({queryKey:["document-folders"]})
  });
  const deleteFolder = useMutation({
    mutationFn:(id:string)=>api(`/api/document-folders/${id}`,{method:"DELETE"}),
    onSuccess:()=>{qc.invalidateQueries({queryKey:["document-folders"]});qc.invalidateQueries({queryKey:["documents"]});}
  });
  const moveDocument = useMutation({
    mutationFn:async({id,target}:{id:string;target:string})=>{const fd=new FormData();if(target)fd.set("folder_id",target);return api(`/api/documents/${id}/folder`,{method:"PUT",body:fd});},
    onSuccess:()=>{qc.invalidateQueries({queryKey:["documents"]});qc.invalidateQueries({queryKey:["document-folders"]});}
  });

  function submit(event: FormEvent) { event.preventDefault(); upload.mutate(); }

  const translateCategory = (name: string) => ({
    "Blood tests": tr("Анализы крови", "Blood tests"), "Doctor visits": tr("Приёмы врача", "Doctor visits"), Prescriptions: tr("Рецепты", "Prescriptions"), "Medical reports": tr("Медицинские заключения", "Medical reports"), Other: tr("Другое", "Other")
  }[name] ?? name);
  const categoryName = (id: string | null) => { const name = categories.data?.find((item) => item.id === id)?.name; return name ? translateCategory(name) : tr("Без категории", "Uncategorized"); };
  const folderPath = (folder: BrowserFolder) => { const parts=[folder.name];let parent=folder.parent_id;const seen=new Set<string>();while(parent&&!seen.has(parent)){seen.add(parent);const row=folders.data?.find(x=>x.id===parent);if(!row)break;parts.unshift(row.name);parent=row.parent_id;}return parts.join(" / "); };

  return <AppShell><div className="page stack" style={{ gap: 20 }}>
    <header className="page-head"><div><div className="eyebrow">{tr("Документы", "Documents")}</div><h1>{tr("Личный медицинский архив", "Private medical archive")}</h1></div>{canEdit&&<button className="btn" onClick={() => { setFolderId(currentFolder??""); setOpenUpload((value) => !value); }}><Plus size={17}/>{tr("Загрузить", "Upload")}</button>}</header>

    <FolderBrowser
      folders={folders.data??[]}
      currentId={currentFolder}
      rootLabel={tr("Все папки", "All folders")}
      folderLabel={tr("Папки документов", "Document folders")}
      itemLabel={(count)=>tr(`${count} документов`, `${count} documents`)}
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

    <div className="form-grid">
      <div className="field"><label htmlFor="doc-search">{tr("Поиск в текущей папке", "Search this folder")}</label><div style={{position:"relative"}}><Search size={16} style={{position:"absolute",left:12,top:14,color:"var(--muted)"}}/><input id="doc-search" className="input" style={{paddingLeft:36}} value={q} onChange={(e)=>setQ(e.target.value)} placeholder={tr("Анализ, рецепт…", "Blood test, prescription…")}/></div></div>
      <div className="field"><label htmlFor="doc-category-filter">{tr("Категория", "Category")}</label><select id="doc-category-filter" className="select" value={filterCategory} onChange={(e)=>setFilterCategory(e.target.value)}><option value="">{tr("Все категории", "All categories")}</option>{categories.data?.map((item)=><option key={item.id} value={item.id}>{translateCategory(item.name)}</option>)}</select></div>
    </div>

    {openUpload && canEdit && <form className="card section stack" onSubmit={submit}>
      <h2>{tr("Загрузить документ", "Upload document")}</h2>
      <div className="form-grid">
        <div className="field"><label>{tr("Файл", "File")}</label><input className="input" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e)=>setFile(e.target.files?.[0]??null)} required/></div>
        <div className="field"><label>{tr("Дата документа", "Document date")}</label><input className="input" type="date" value={date} onChange={(e)=>setDate(e.target.value)}/></div>
        <div className="field"><label>{tr("Название", "Title")}</label><input className="input" value={title} onChange={(e)=>setTitle(e.target.value)} placeholder={file?.name||tr("Название документа", "Document title")}/></div>
        <div className="field"><label>{tr("Папка", "Folder")}</label><select className="select" value={folderId} onChange={e=>setFolderId(e.target.value)}><option value="">{tr("Корень / без папки", "Root / unfiled")}</option>{folders.data?.map(folder=><option key={folder.id} value={folder.id}>{folderPath(folder)}</option>)}</select></div>
        <div className="field"><label>{tr("Категория", "Category")}</label><select className="select" value={categoryId} onChange={(e)=>setCategoryId(e.target.value)}><option value="">{tr("Без категории", "Uncategorized")}</option>{categories.data?.map((item)=><option key={item.id} value={item.id}>{translateCategory(item.name)}</option>)}</select></div>
      </div>
      <div className="row responsive-form-row"><div className="field" style={{flex:1}}><label>{tr("Новая категория", "New category")}</label><input className="input" value={newCategory} onChange={(e)=>setNewCategory(e.target.value)} placeholder={tr("Своя категория", "Custom category")}/></div><button type="button" className="btn secondary" disabled={!newCategory.trim()} onClick={()=>createCategory.mutate()}>{tr("Добавить категорию", "Add category")}</button></div>
      <div className="field"><label>{tr("Заметка", "Note")}</label><textarea className="textarea" value={note} onChange={(e)=>setNote(e.target.value)}/></div>
      <div className="notice">{tr("Файлы остаются приватными и доступны только после авторизации.", "Files stay private and are served only after authorization.")}</div>
      {upload.error && <div className="error">{upload.error.message}</div>}
      <div className="form-actions"><button type="button" className="btn secondary" onClick={()=>setOpenUpload(false)}>{tr("Отмена", "Cancel")}</button><button className="btn" disabled={upload.isPending}>{upload.isPending?tr("Загрузка…", "Uploading…"):tr("Загрузить документ", "Upload document")}</button></div>
    </form>}

    {query.isLoading && <div className="skeleton" style={{height:220}}/>}
    {query.error && <div className="error">{query.error.message}</div>}
    <section className="card document-list">
      {visibleDocs.map((doc)=><div className="document-row" key={doc.id}>
        <div className="doc-icon"><FileText size={19}/></div>
        <div className="document-main"><button className="document-title" onClick={()=>setPreview(doc)}>{doc.title}</button><div className="muted small document-meta">{categoryName(doc.category_id)} · {doc.original_filename} · {(doc.size_bytes/1024/1024).toFixed(2)} MB{doc.document_date?` · ${doc.document_date}`:""}</div></div>
        {canEdit&&<select className="select document-folder-select" aria-label={tr("Переместить документ", "Move document")} value={doc.folder_id??""} onChange={e=>moveDocument.mutate({id:doc.id,target:e.target.value})}><option value="">{tr("Корень", "Root")}</option>{folders.data?.map(folder=><option key={folder.id} value={folder.id}>{folderPath(folder)}</option>)}</select>}
        {canEdit&&<button className="btn danger icon-btn" aria-label={tr("Удалить документ", "Delete document")} onClick={()=>{if(confirm(tr("Удалить этот документ? Файл будет удалён из хранилища.", "Delete this document? The stored file will be removed.")))remove.mutate(doc.id)}}><Trash2 size={16}/></button>}
      </div>)}
      {visibleDocs.length===0 && !query.isLoading && <div className="empty">{tr("В этой папке документов нет.", "There are no documents in this folder.")}</div>}
    </section>

    {preview && <section className="card section stack"><div className="row between responsive-between"><div style={{minWidth:0}}><h2 className="truncate-block">{preview.title}</h2><div className="muted small truncate-block" style={{marginTop:4}}>{preview.original_filename}</div></div><button className="btn secondary icon-btn" aria-label={tr("Закрыть предпросмотр", "Close preview")} onClick={()=>setPreview(null)}><X size={17}/></button></div>{preview.mime_type==="application/pdf"?<iframe title={preview.title} src={`/api/documents/${preview.id}/content`} style={{width:"100%",height:"70vh",border:"1px solid var(--line)",borderRadius:12}}/>:<Image unoptimized width={1400} height={1050} src={`/api/documents/${preview.id}/content`} alt={preview.title} style={{display:"block",width:"auto",height:"auto",maxWidth:"100%",maxHeight:"70vh",margin:"0 auto",borderRadius:12}}/>}</section>}
  </div></AppShell>;
}
