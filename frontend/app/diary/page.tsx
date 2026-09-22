"use client";

import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, Pencil, Plus, Search, Send, Trash2, X } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { api } from "@/lib/api";
import { useLanguage } from "@/lib/i18n";

type Comment={id:string;entry_id:string;body:string;author_id:string;author_name:string;author_role:string;is_mine:boolean;created_at:string;updated_at:string};
type Entry={id:string;occurred_at:string;title:string|null;body:string;category:string;severity:number|null;created_at:string;updated_at:string;comments:Comment[]};
type SessionPayload={user:{role:string}};

export default function DiaryPage(){
  const qc=useQueryClient();
  const {tr,dateLocale}=useLanguage();
  const [q,setQ]=useState(""); const [category,setCategory]=useState(""); const [open,setOpen]=useState(false);
  const [title,setTitle]=useState(""); const [body,setBody]=useState(""); const [entryCategory,setEntryCategory]=useState("general wellbeing"); const [severity,setSeverity]=useState("");
  const [editingEntryId,setEditingEntryId]=useState<string|null>(null);
  const [editOccurredAt,setEditOccurredAt]=useState(""); const [editTitle,setEditTitle]=useState(""); const [editBody,setEditBody]=useState("");
  const [editCategory,setEditCategory]=useState("general wellbeing"); const [editSeverity,setEditSeverity]=useState("");
  const me=useQuery({queryKey:["me"],queryFn:()=>api<SessionPayload>("/api/auth/me")});
  const canEditEntry=!!me.data?.user.role&&me.data.user.role!=="DOCTOR";
  const query=useQuery({queryKey:["diary",q,category],queryFn:()=>api<Entry[]>(`/api/diary?${new URLSearchParams({...(q?{q}:{}),...(category?{category}:{})})}`)});
  const create=useMutation({mutationFn:()=>api<Entry>("/api/diary",{method:"POST",body:JSON.stringify({occurred_at:new Date().toISOString(),title:title||null,body,category:entryCategory,severity:severity?Number(severity):null})}),onSuccess:()=>{setOpen(false);setTitle("");setBody("");setSeverity("");qc.invalidateQueries({queryKey:["diary"]});}});
  const editEntry=useMutation({mutationFn:(id:string)=>api<Entry>(`/api/diary/${id}`,{method:"PUT",body:JSON.stringify({occurred_at:new Date(editOccurredAt).toISOString(),title:editTitle.trim()||null,body:editBody.trim(),category:editCategory,severity:editSeverity?Number(editSeverity):null})}),onSuccess:()=>{setEditingEntryId(null);qc.invalidateQueries({queryKey:["diary"]});}});
  const remove=useMutation({mutationFn:(id:string)=>api(`/api/diary/${id}`,{method:"DELETE"}),onSuccess:()=>qc.invalidateQueries({queryKey:["diary"]})});
  function submit(e:FormEvent){e.preventDefault();create.mutate();}
  function localDateTimeValue(value:string){
    const d=new Date(value); const pad=(n:number)=>String(n).padStart(2,"0");
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function beginEdit(entry:Entry){
    setEditingEntryId(entry.id); setEditOccurredAt(localDateTimeValue(entry.occurred_at)); setEditTitle(entry.title??""); setEditBody(entry.body);
    setEditCategory(entry.category); setEditSeverity(entry.severity?String(entry.severity):"");
  }
  function cancelEdit(){setEditingEntryId(null);setEditOccurredAt("");setEditTitle("");setEditBody("");setEditSeverity("");}
  const categories=["lips","skin","eyes","nose","general wellbeing","other"];
  const categoryLabel=(value:string)=>({
    lips:tr("Губы","Lips"),skin:tr("Кожа","Skin"),eyes:tr("Глаза","Eyes"),nose:tr("Нос","Nose"),
    "general wellbeing":tr("Общее самочувствие","General wellbeing"),other:tr("Другое","Other")
  }[value]??value);
  return <AppShell><div className="page stack" style={{gap:20}}>
    <header className="page-head"><div><div className="eyebrow">{tr("Дневник","Diary")}</div><h1>{tr("Заметки о самочувствии","Wellbeing notes")}</h1></div>{canEditEntry&&<button className="btn" onClick={()=>setOpen(v=>!v)}><Plus size={17}/>{tr("Новая запись","New entry")}</button>}</header>
    <div className="row responsive-form-row"><div className="field" style={{flex:1}}><label htmlFor="search">{tr("Поиск","Search")}</label><div style={{position:"relative"}}><Search size={16} style={{position:"absolute",left:12,top:14,color:"var(--muted)"}}/><input id="search" className="input" style={{paddingLeft:36}} value={q} onChange={e=>setQ(e.target.value)} placeholder={tr("Поиск по заметкам","Search notes")}/></div></div><div className="field" style={{minWidth:180}}><label htmlFor="cat">{tr("Категория","Category")}</label><select id="cat" className="select" value={category} onChange={e=>setCategory(e.target.value)}><option value="">{tr("Все","All")}</option>{categories.map(x=><option key={x} value={x}>{categoryLabel(x)}</option>)}</select></div></div>
    {open&&canEditEntry&&<form className="card section stack" onSubmit={submit}><h2>{tr("Добавить запись","Add diary entry")}</h2><div className="form-grid"><div className="field"><label>{tr("Название","Title")}</label><input className="input" value={title} onChange={e=>setTitle(e.target.value)} maxLength={160}/></div><div className="field"><label>{tr("Категория","Category")}</label><select className="select" value={entryCategory} onChange={e=>setEntryCategory(e.target.value)}>{categories.map(x=><option key={x} value={x}>{categoryLabel(x)}</option>)}</select></div></div><div className="field"><label>{tr("Что вы заметили?","What did you notice?")}</label><textarea className="textarea" value={body} onChange={e=>setBody(e.target.value)} required maxLength={20000}/></div><div className="field" style={{maxWidth:220}}><label>{tr("Выраженность","Severity")}</label><select className="select" value={severity} onChange={e=>setSeverity(e.target.value)}><option value="">{tr("Не указано","Not set")}</option>{[1,2,3,4,5].map(x=><option key={x} value={x}>{x}</option>)}</select></div>{create.error&&<div className="error">{create.error.message}</div>}<div className="form-actions"><button type="button" className="btn secondary" onClick={()=>setOpen(false)}>{tr("Отмена","Cancel")}</button><button className="btn" disabled={create.isPending}>{create.isPending?tr("Сохранение…","Saving…"):tr("Сохранить запись","Save entry")}</button></div></form>}
    {query.isLoading&&<div className="skeleton" style={{height:220}}/>}
    {query.error&&<div className="error">{query.error.message}</div>}
    <div className="stack">{query.data?.map(entry=><article className="card diary-card" key={entry.id}>
      <div className="diary-entry-content">{editingEntryId===entry.id&&canEditEntry?<form className="stack" onSubmit={(e)=>{e.preventDefault();if(editOccurredAt&&editBody.trim())editEntry.mutate(entry.id);}}>
        <h2 style={{fontSize:17}}>{tr("Редактировать запись","Edit entry")}</h2>
        <div className="form-grid">
          <div className="field"><label htmlFor={`edit-date-${entry.id}`}>{tr("Дата и время","Date and time")}</label><input id={`edit-date-${entry.id}`} className="input" type="datetime-local" value={editOccurredAt} onChange={e=>setEditOccurredAt(e.target.value)} required/></div>
          <div className="field"><label htmlFor={`edit-title-${entry.id}`}>{tr("Название","Title")}</label><input id={`edit-title-${entry.id}`} className="input" value={editTitle} onChange={e=>setEditTitle(e.target.value)} maxLength={160}/></div>
          <div className="field"><label htmlFor={`edit-category-${entry.id}`}>{tr("Категория","Category")}</label><select id={`edit-category-${entry.id}`} className="select" value={editCategory} onChange={e=>setEditCategory(e.target.value)}>{categories.map(x=><option key={x} value={x}>{categoryLabel(x)}</option>)}</select></div>
          <div className="field"><label htmlFor={`edit-severity-${entry.id}`}>{tr("Выраженность","Severity")}</label><select id={`edit-severity-${entry.id}`} className="select" value={editSeverity} onChange={e=>setEditSeverity(e.target.value)}><option value="">{tr("Не указано","Not set")}</option>{[1,2,3,4,5].map(x=><option key={x} value={x}>{x}</option>)}</select></div>
        </div>
        <div className="field"><label htmlFor={`edit-body-${entry.id}`}>{tr("Что вы заметили?","What did you notice?")}</label><textarea id={`edit-body-${entry.id}`} className="textarea" value={editBody} onChange={e=>setEditBody(e.target.value)} required maxLength={20000}/></div>
        {editEntry.error&&<div className="error">{editEntry.error.message}</div>}
        <div className="form-actions"><button type="button" className="btn secondary" onClick={cancelEdit}>{tr("Отмена","Cancel")}</button><button className="btn" disabled={editEntry.isPending||!editOccurredAt||!editBody.trim()}>{editEntry.isPending?tr("Сохранение…","Saving…"):tr("Сохранить изменения","Save changes")}</button></div>
      </form>:<><div className="row between diary-entry-head"><div><h2 style={{fontSize:17}}>{entry.title||categoryLabel(entry.category)}</h2><div className="muted small" style={{marginTop:5}}>{new Date(entry.occurred_at).toLocaleString(dateLocale)} · {categoryLabel(entry.category)}{entry.severity?` · ${tr("выраженность","severity")} ${entry.severity}/5`:""}</div></div>{canEditEntry&&<div className="row"><button className="btn secondary icon-btn" aria-label={tr("Редактировать запись","Edit entry")} onClick={()=>beginEdit(entry)}><Pencil size={16}/></button><button className="btn danger icon-btn" aria-label={tr("Удалить запись","Delete entry")} onClick={()=>{if(confirm(tr("Удалить эту запись дневника?","Delete this diary entry?")))remove.mutate(entry.id)}}><Trash2 size={16}/></button></div>}</div><p style={{whiteSpace:"pre-wrap",marginBottom:0}}>{entry.body}</p></>}</div>
      <CommentThread entry={entry} dateLocale={dateLocale} tr={tr} onChanged={()=>qc.invalidateQueries({queryKey:["diary"]})}/>
    </article>)}</div>
    {query.data?.length===0&&<div className="card empty">{tr("По выбранным условиям записей нет.","No diary entries match this view.")}</div>}
  </div></AppShell>;
}

function CommentThread({entry,dateLocale,tr,onChanged}:{entry:Entry;dateLocale:string;tr:(ru:string,en:string)=>string;onChanged:()=>void}){
  const [text,setText]=useState("");
  const [editing,setEditing]=useState<string|null>(null);
  const [editText,setEditText]=useState("");
  const create=useMutation({mutationFn:()=>api<Comment>(`/api/diary/${entry.id}/comments`,{method:"POST",body:JSON.stringify({body:text})}),onSuccess:()=>{setText("");onChanged();}});
  const edit=useMutation({mutationFn:({id,body}:{id:string;body:string})=>api<Comment>(`/api/diary/comments/${id}`,{method:"PUT",body:JSON.stringify({body})}),onSuccess:()=>{setEditing(null);setEditText("");onChanged();}});
  const remove=useMutation({mutationFn:(id:string)=>api(`/api/diary/comments/${id}`,{method:"DELETE"}),onSuccess:onChanged});
  const roleLabel=(comment:Comment)=>comment.is_mine?tr("Вы","You"):comment.author_role==="DOCTOR"?tr("Врач","Doctor"):tr("Пациент","Patient");
  return <div className="diary-comments">
    <div className="diary-comments-title"><MessageCircle size={16}/><strong>{tr("Комментарии","Comments")}</strong><span>{entry.comments?.length??0}</span></div>
    <div className="comment-list">{entry.comments?.map(comment=><div className={`comment-bubble ${comment.author_role==="DOCTOR"?"doctor":"patient"}`} key={comment.id}>
      <div className="comment-meta"><div><strong>{roleLabel(comment)}</strong>{!comment.is_mine&&comment.author_name&&<span> · {comment.author_name}</span>}</div><span>{new Date(comment.created_at).toLocaleString(dateLocale)}</span></div>
      {editing===comment.id?<div className="comment-edit"><textarea className="textarea" value={editText} onChange={e=>setEditText(e.target.value)} maxLength={5000}/><div className="row"><button className="btn compact-btn" disabled={!editText.trim()} onClick={()=>edit.mutate({id:comment.id,body:editText.trim()})}>{tr("Сохранить","Save")}</button><button className="btn secondary icon-btn" onClick={()=>setEditing(null)} aria-label={tr("Отмена","Cancel")}><X size={15}/></button></div></div>:<p>{comment.body}</p>}
      {comment.is_mine&&editing!==comment.id&&<div className="comment-actions"><button className="icon-plain" aria-label={tr("Редактировать комментарий","Edit comment")} onClick={()=>{setEditing(comment.id);setEditText(comment.body);}}><Pencil size={14}/></button><button className="icon-plain danger-text" aria-label={tr("Удалить комментарий","Delete comment")} onClick={()=>{if(confirm(tr("Удалить комментарий?","Delete comment?")))remove.mutate(comment.id)}}><Trash2 size={14}/></button></div>}
    </div>)}</div>
    <form className="comment-compose" onSubmit={(e)=>{e.preventDefault();if(text.trim())create.mutate();}}><textarea className="textarea" value={text} onChange={e=>setText(e.target.value)} placeholder={tr("Добавить комментарий…","Add a comment…")} maxLength={5000}/><button className="btn icon-btn" disabled={!text.trim()||create.isPending} aria-label={tr("Отправить комментарий","Send comment")}><Send size={16}/></button></form>
  </div>;
}
