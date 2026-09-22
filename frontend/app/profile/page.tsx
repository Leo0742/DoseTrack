"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AtSign, CalendarDays, Camera, Mail, Ruler, Trash2, UserRound, Weight } from "lucide-react";
import Image from "next/image";
import { AppShell } from "@/components/app-shell";
import { api } from "@/lib/api";
import { useLanguage } from "@/lib/i18n";

type Profile = {
  id:string;
  email:string;
  username:string;
  role:string;
  timezone:string;
  first_name:string|null;
  last_name:string|null;
  birth_date:string|null;
  age:number|null;
  height_cm:number|null;
  latest_weight_kg:number|null;
  latest_weight_date:string|null;
  has_avatar:boolean;
};

export default function ProfilePage(){
  const qc=useQueryClient();
  const {tr,dateLocale}=useLanguage();
  const fmt=new Intl.NumberFormat(dateLocale,{maximumFractionDigits:1});
  const profile=useQuery({queryKey:["profile"],queryFn:()=>api<Profile>("/api/auth/profile")});
  const [form,setForm]=useState({email:"",first_name:"",last_name:"",birth_date:"",height_cm:""});
  const [saved,setSaved]=useState(false);
  const [avatarVersion,setAvatarVersion]=useState(0);
  const formInitialized=useRef(false);
  useEffect(()=>{
    if(profile.data&&!formInitialized.current){
      formInitialized.current=true;
      setForm({
      email:profile.data.email,
      first_name:profile.data.first_name??"",
      last_name:profile.data.last_name??"",
      birth_date:profile.data.birth_date??"",
      height_cm:profile.data.height_cm==null?"":String(profile.data.height_cm)
      });
    }
  },[profile.data]);
  const save=useMutation({
    mutationFn:()=>api<Profile>("/api/auth/profile",{method:"PUT",body:JSON.stringify({
      email:form.email,
      first_name:form.first_name||null,
      last_name:form.last_name||null,
      birth_date:form.birth_date||null,
      height_cm:form.height_cm?Number(form.height_cm):null
    })}),
    onSuccess:(data)=>{qc.setQueryData(["profile"],data);qc.invalidateQueries({queryKey:["me"]});setSaved(true);setTimeout(()=>setSaved(false),1800);}
  });
  const uploadAvatar=useMutation({
    mutationFn:async(file:File)=>{const fd=new FormData();fd.set("file",file);return api("/api/auth/avatar",{method:"POST",body:fd});},
    onSuccess:()=>{setAvatarVersion(v=>v+1);qc.invalidateQueries({queryKey:["profile"]});qc.invalidateQueries({queryKey:["me"]});}
  });
  const removeAvatar=useMutation({
    mutationFn:()=>api("/api/auth/avatar",{method:"DELETE"}),
    onSuccess:()=>{setAvatarVersion(v=>v+1);qc.invalidateQueries({queryKey:["profile"]});qc.invalidateQueries({queryKey:["me"]});}
  });
  const initials=useMemo(()=>{
    const first=form.first_name.trim()[0]??"";
    const last=form.last_name.trim()[0]??"";
    return (first+last||profile.data?.username?.slice(0,2)||"DT").toUpperCase();
  },[form.first_name,form.last_name,profile.data?.username]);
  const weightDate=profile.data?.latest_weight_date?new Date(`${profile.data.latest_weight_date}T12:00:00`).toLocaleDateString(dateLocale,{day:"numeric",month:"short"}):null;

  return <AppShell><div className="page stack" style={{gap:20}}>
    <header className="page-head"><div><div className="eyebrow">{tr("Профиль","Profile")}</div><h1>{tr("Обо мне","About me")}</h1></div></header>
    {profile.isLoading&&<div className="skeleton" style={{height:260}}/>}
    {profile.error&&<div className="error">{profile.error.message}</div>}
    {profile.data&&<>
      <section className="card profile-hero">
        <div className="profile-avatar-wrap">
          <div className="profile-avatar">{profile.data.has_avatar?<Image unoptimized width={72} height={72} src={`/api/auth/avatar?v=${avatarVersion}`} alt={tr("Аватар","Avatar")}/>:initials}</div>
          <label className="profile-avatar-action" title={tr("Изменить аватар","Change avatar")}><Camera size={15}/><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{const f=e.target.files?.[0];if(f)uploadAvatar.mutate(f);e.currentTarget.value="";}}/></label>
        </div>
        <div className="profile-identity"><h2>{form.first_name||form.last_name?`${form.first_name} ${form.last_name}`.trim():profile.data.username}</h2><div className="muted">@{profile.data.username}</div>{profile.data.has_avatar&&<button className="text-button danger-text" onClick={()=>removeAvatar.mutate()} disabled={removeAvatar.isPending}><Trash2 size={13}/>{tr("Удалить фото","Remove photo")}</button>}</div>
        <div className="profile-quick-grid">
          <div className="profile-quick"><CalendarDays size={17}/><div><span>{tr("Возраст","Age")}</span><strong>{profile.data.age==null?"—":`${profile.data.age} ${tr("лет","years")}`}</strong></div></div>
          <div className="profile-quick"><Ruler size={17}/><div><span>{tr("Рост","Height")}</span><strong>{profile.data.height_cm==null?"—":`${profile.data.height_cm} cm`}</strong></div></div>
          <div className="profile-quick"><Weight size={17}/><div><span>{tr("Текущий вес","Current weight")}</span><strong>{profile.data.latest_weight_kg==null?"—":`${fmt.format(profile.data.latest_weight_kg)} kg`}</strong>{weightDate&&<small>{weightDate}</small>}</div></div>
        </div>
      </section>

      <div className="profile-layout">
        <form className="card section stack" onSubmit={(e:FormEvent)=>{e.preventDefault();save.mutate();}}>
          <div className="row"><UserRound size={19}/><h2>{tr("Личные данные","Personal details")}</h2></div>
          <p className="muted small" style={{margin:0}}>{tr("Эта информация помогает вам и врачу быстро ориентироваться в профиле. Она не меняет схему лечения автоматически.","This information helps you and your doctor understand the profile quickly. It never changes treatment automatically.")}</p>
          <div className="form-grid">
            <div className="field" style={{gridColumn:"1/-1"}}><label>{tr("Email","Email")}</label><input className="input" aria-label={tr("Email","Email")} type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} required/></div>
            <div className="field"><label>{tr("Имя","First name")}</label><input className="input" aria-label={tr("Имя","First name")} value={form.first_name} onChange={e=>setForm({...form,first_name:e.target.value})}/></div>
            <div className="field"><label>{tr("Фамилия","Last name")}</label><input className="input" aria-label={tr("Фамилия","Last name")} value={form.last_name} onChange={e=>setForm({...form,last_name:e.target.value})}/></div>
            <div className="field"><label>{tr("Дата рождения","Date of birth")}</label><input className="input" aria-label={tr("Дата рождения","Date of birth")} type="date" value={form.birth_date} onChange={e=>setForm({...form,birth_date:e.target.value})}/></div>
            <div className="field"><label>{tr("Рост, см","Height, cm")}</label><input className="input" aria-label={tr("Рост, см","Height, cm")} type="number" min="51" max="259" step="0.1" value={form.height_cm} onChange={e=>setForm({...form,height_cm:e.target.value})}/></div>
          </div>
          {save.error&&<div className="error">{save.error.message||tr("Не удалось сохранить профиль.","Could not save profile.")}</div>}
          <div className="form-actions"><button className="btn" disabled={save.isPending}>{saved?tr("Сохранено","Saved"):tr("Сохранить","Save")}</button></div>
        </form>

        <section className="card section stack profile-account-card">
          <h2>{tr("Аккаунт","Account")}</h2>
          <div className="profile-account-row"><Mail size={17}/><div><span>{tr("Email","Email")}</span><strong>{form.email}</strong></div></div>
          <div className="profile-account-row"><AtSign size={17}/><div><span>{tr("Логин","Username")}</span><strong>{profile.data.username}</strong></div></div>
          <div className="divider"/>
          <div><div className="muted small">{tr("Вес берётся из истории веса и показывает последнее измерение.","Weight is taken from weight history and shows the latest measurement.")}</div><a className="text-link" href="/settings#weight">{tr("Открыть историю веса →","Open weight history →")}</a></div>
        </section>
      </div>
    </>}
  </div></AppShell>;
}
