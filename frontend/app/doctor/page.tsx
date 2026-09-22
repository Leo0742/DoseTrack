"use client";

import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CalendarClock, FileText, Images, Ruler, ShieldCheck, Stethoscope, Weight } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ProgressRing } from "@/components/progress-ring";
import { api } from "@/lib/api";
import { useLanguage } from "@/lib/i18n";

type PatientProfile={id:string;username:string;email:string;first_name:string|null;last_name:string|null;birth_date:string|null;age:number|null;height_cm:number|null;latest_weight_kg:number|null;latest_weight_date:string|null};
type Progress={summary:{name:string;medication_name:string;start_date:string;status:string;cumulative_mg:number;target_mg:number;remaining_mg:number;percent:number;taken_doses:number;skipped_doses:number;adherence_percent:number|null;daily_planned_mg:number;estimated_completion_date:string|null;estimated_days:number|null};};
type Regimen={id:string;effective_from:string;effective_to:string|null;notes:string|null;slots:{slot_key:string;label:string;planned_time:string;dose_mg:number}[]};
type WeightRow={id:string;date:string;weight_kg:number;note:string|null};
type Intake={id:string;date:string;label:string;slot_key?:string;planned_time:string;planned_dose_mg:number;status:string;actual_dose_mg:number|null;taken_at:string|null};
type Doc={id:string;title:string;document_date:string|null;original_filename:string};
type Photo={id:string;photo_date:string;title:string|null};

export default function DoctorPage(){
  const {tr,statusLabel,dateLocale}=useLanguage();
  const fmt=new Intl.NumberFormat(dateLocale,{maximumFractionDigits:1});
  const profile=useQuery({queryKey:["doctor-patient-profile"],queryFn:()=>api<PatientProfile>("/api/patient/profile")});
  const progress=useQuery({queryKey:["doctor-progress"],queryFn:()=>api<Progress>("/api/progress")});
  const regimens=useQuery({queryKey:["doctor-regimens"],queryFn:()=>api<Regimen[]>("/api/treatment/regimens")});
  const weights=useQuery({queryKey:["doctor-weights"],queryFn:()=>api<WeightRow[]>("/api/weights")});
  const history=useQuery({queryKey:["doctor-history"],queryFn:()=>api<Intake[]>("/api/history"),select:x=>x.slice(0,10)});
  const docs=useQuery({queryKey:["doctor-docs"],queryFn:()=>api<Doc[]>("/api/documents"),select:x=>x.slice(0,5)});
  const photos=useQuery({queryKey:["doctor-photos"],queryFn:()=>api<Photo[]>("/api/photos"),select:x=>x.slice(0,5)});
  const currentRegimen=regimens.data?.[0];
  const patientName=profile.data?.first_name||profile.data?.last_name?`${profile.data?.first_name??""} ${profile.data?.last_name??""}`.trim():profile.data?.username??tr("Пациент","Patient");
  const initials=((profile.data?.first_name?.[0]??"")+(profile.data?.last_name?.[0]??"")||profile.data?.username?.slice(0,2)||"PT").toUpperCase();
  const weightData=[...(weights.data??[])].reverse().map(w=>({date:w.date,kg:w.weight_kg}));
  const formatDate=(value:string|null,opts:Intl.DateTimeFormatOptions={day:"numeric",month:"short",year:"numeric"})=>value?new Date(`${value}T12:00:00`).toLocaleDateString(dateLocale,opts):"—";

  return <AppShell><div className="page doctor-page stack" style={{gap:20}}>
    <header className="page-head doctor-page-head"><div><div className="eyebrow">{tr("Кабинет врача","Doctor workspace")}</div><h1>{tr("Обзор пациента","Patient overview")}</h1><p className="muted doctor-subtitle">{tr("Основные данные курса собраны в одном месте без возможности случайного редактирования.","Key treatment information is collected in one read-only workspace.")}</p></div><div className="doctor-readonly-badge"><ShieldCheck size={16}/>{tr("Только чтение","Read only")}</div></header>

    {(progress.isLoading||profile.isLoading)&&<div className="skeleton" style={{height:300}}/>}
    {(progress.error||profile.error)&&<div className="error">{(progress.error||profile.error)?.message}</div>}

    {profile.data&&<section className="card doctor-patient-card">
      <div className="doctor-patient-main"><div className="doctor-avatar">{initials}</div><div><div className="muted small">{tr("Пациент","Patient")}</div><h2>{patientName}</h2><div className="muted small">{profile.data.email}</div></div></div>
      <div className="doctor-patient-facts">
        <div className="doctor-fact"><CalendarClock size={17}/><span>{tr("Возраст","Age")}</span><strong>{profile.data.age==null?"—":`${profile.data.age} ${tr("лет","years")}`}</strong></div>
        <div className="doctor-fact"><Ruler size={17}/><span>{tr("Рост","Height")}</span><strong>{profile.data.height_cm==null?"—":`${profile.data.height_cm} cm`}</strong></div>
        <div className="doctor-fact"><Weight size={17}/><span>{tr("Вес","Weight")}</span><strong>{profile.data.latest_weight_kg==null?"—":`${fmt.format(profile.data.latest_weight_kg)} kg`}</strong></div>
      </div>
    </section>}

    {progress.data&&<>
      <section className="card doctor-progress-hero">
        <div className="doctor-progress-copy">
          <div className="row wrap" style={{gap:8}}><span className="status-pill active">{statusLabel(progress.data.summary.status)}</span><span className="muted small">{progress.data.summary.medication_name}</span></div>
          <div className="dose-number tabular doctor-dose-number">{fmt.format(progress.data.summary.cumulative_mg)} <span>/ {fmt.format(progress.data.summary.target_mg)} mg</span></div>
          <div className="progress-track"><div className="progress-fill" style={{width:`${Math.min(progress.data.summary.percent,100)}%`}}/></div>
          <div className="progress-meta"><span>{fmt.format(progress.data.summary.percent)}% {tr("курса отмечено","recorded")}</span><span>{tr("осталось","remaining")} {fmt.format(progress.data.summary.remaining_mg)} mg</span></div>
        </div>
        <ProgressRing percent={progress.data.summary.percent} label={`${fmt.format(progress.data.summary.percent)}%`}/>
        <div className="doctor-forecast-stack">
          <div><span>{tr("По текущей схеме","Current regimen")}</span><strong>{fmt.format(progress.data.summary.daily_planned_mg)} mg/{tr("день","day")}</strong></div>
          <div><span>{tr("До завершения","Time remaining")}</span><strong>{progress.data.summary.estimated_days==null?"—":`≈ ${progress.data.summary.estimated_days} ${tr("дн.","days")}`}</strong></div>
          <div><span>{tr("Ориентировочная дата","Estimated date")}</span><strong>{formatDate(progress.data.summary.estimated_completion_date,{day:"numeric",month:"long",year:"numeric"})}</strong></div>
          <div><span>{tr("Соблюдение","Adherence")}</span><strong>{progress.data.summary.adherence_percent==null?"—":`${fmt.format(progress.data.summary.adherence_percent)}%`}</strong></div>
        </div>
      </section>

      <div className="doctor-info-grid">
        <section className="card section doctor-info-card">
          <div className="section-kicker"><Stethoscope size={17}/>{tr("Лечение","Treatment")}</div>
          <h2>{progress.data.summary.name}</h2>
          <div className="read-only-list">
            <div><span>{tr("Препарат","Medication")}</span><strong>{progress.data.summary.medication_name}</strong></div>
            <div><span>{tr("Начало курса","Started")}</span><strong>{formatDate(progress.data.summary.start_date)}</strong></div>
            <div><span>{tr("Целевая суммарная доза","Cumulative target")}</span><strong>{fmt.format(progress.data.summary.target_mg)} mg</strong></div>
            <div><span>{tr("Принято / пропущено","Taken / skipped")}</span><strong>{progress.data.summary.taken_doses} / {progress.data.summary.skipped_doses}</strong></div>
          </div>
        </section>

        <section className="card section doctor-info-card">
          <div className="section-kicker"><CalendarClock size={17}/>{tr("Текущая схема приёма","Current regimen")}</div>
          {currentRegimen?<><div className="muted small">{tr("Действует с","Effective from")} {formatDate(currentRegimen.effective_from)}</div><div className="regimen-readonly-list">{currentRegimen.slots.map(slot=><div className="regimen-readonly-row" key={slot.slot_key}><div><span className={`state-dot ${slot.slot_key==="morning"?"taken":""}`}/><strong>{slot.slot_key==="morning"?tr("Утро","Morning"):slot.slot_key==="evening"?tr("Вечер","Evening"):slot.label}</strong></div><span className="tabular">{slot.planned_time.slice(0,5)}</span><strong className="tabular">{fmt.format(slot.dose_mg)} mg</strong></div>)}</div>{currentRegimen.notes&&<div className="notice subtle-notice">{currentRegimen.notes}</div>}</>:<div className="empty compact-empty">{tr("Схема не указана.","No regimen available.")}</div>}
        </section>
      </div>

      <section className="card section doctor-weight-card">
        <div className="row between responsive-between"><div><div className="section-kicker"><Weight size={17}/>{tr("История веса","Weight history")}</div><h2>{profile.data?.latest_weight_kg==null?tr("Нет измерений","No measurements"):`${fmt.format(profile.data.latest_weight_kg)} kg`}</h2></div>{profile.data?.latest_weight_date&&<span className="muted small">{tr("последнее измерение","last measured")} {formatDate(profile.data.latest_weight_date,{day:"numeric",month:"short"})}</span>}</div>
        {weightData.length>0?<div className="doctor-weight-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={weightData} margin={{left:0,right:8,top:12,bottom:0}}><defs><linearGradient id="weightFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2f6b5b" stopOpacity={0.18}/><stop offset="100%" stopColor="#2f6b5b" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#edf0ec" vertical={false}/><XAxis dataKey="date" tick={{fontSize:11,fill:"#7b817d"}} axisLine={false} tickLine={false} minTickGap={35}/><YAxis domain={["dataMin - 1","dataMax + 1"]} tick={{fontSize:11,fill:"#7b817d"}} axisLine={false} tickLine={false} width={34}/><Tooltip formatter={(value)=>[`${value} kg`,tr("Вес","Weight")]} contentStyle={{border:"1px solid #e3e5e1",borderRadius:12,boxShadow:"0 12px 30px rgba(0,0,0,.08)"}}/><Area type="monotone" dataKey="kg" stroke="#2f6b5b" strokeWidth={2.3} fill="url(#weightFill)" animationDuration={600}/></AreaChart></ResponsiveContainer></div>:<div className="empty compact-empty">{tr("История веса пока пустая.","No weight history yet.")}</div>}
      </section>
    </>}

    <section className="card table-scroll doctor-history-card"><div className="section doctor-section-head"><div><div className="section-kicker">{tr("Последние записи","Recent records")}</div><h2>{tr("История приёма","Medication history")}</h2></div><a className="text-link" href="/calendar">{tr("Вся история →","Full history →")}</a></div><table className="table"><thead><tr><th>{tr("Дата","Date")}</th><th>{tr("Приём","Dose")}</th><th>{tr("Время","Time")}</th><th>{tr("Статус","Status")}</th><th>{tr("Фактически","Actual")}</th></tr></thead><tbody>{history.data?.map(i=><tr key={i.id}><td>{formatDate(i.date,{day:"numeric",month:"short"})}</td><td>{i.slot_key==="morning"||i.label==="Morning"?tr("Утро","Morning"):i.slot_key==="evening"||i.label==="Evening"?tr("Вечер","Evening"):i.label}</td><td className="tabular">{i.planned_time.slice(0,5)}</td><td><span className={`status-dot-label ${i.status.toLowerCase()}`}>{statusLabel(i.status)}</span></td><td>{i.status==="TAKEN"?`${fmt.format(i.actual_dose_mg??0)} mg`:"—"}</td></tr>)}</tbody></table></section>

    <div className="grid-2 doctor-materials-grid"><section className="card section"><div className="row between" style={{marginBottom:16}}><div className="row"><FileText size={18}/><h2>{tr("Последние документы","Recent documents")}</h2></div><a className="text-link" href="/documents">{tr("Все →","All →")}</a></div><div className="stack material-list">{docs.data?.map(d=><a className="material-item" key={d.id} href={`/api/documents/${d.id}/content`} target="_blank" rel="noreferrer"><div className="material-icon"><FileText size={16}/></div><div><strong>{d.title}</strong><div className="muted small">{formatDate(d.document_date)}</div></div></a>)}{docs.data?.length===0&&<div className="muted">{tr("Документов нет.","No documents.")}</div>}</div></section><section className="card section"><div className="row between" style={{marginBottom:16}}><div className="row"><Images size={18}/><h2>{tr("Последние фото","Recent photos")}</h2></div><a className="text-link" href="/photos">{tr("Все →","All →")}</a></div><div className="stack material-list">{photos.data?.map(p=><a className="material-item" key={p.id} href={`/api/photos/${p.id}/content`} target="_blank" rel="noreferrer"><div className="material-icon"><Images size={16}/></div><div><strong>{p.title||tr("Фото прогресса","Progress photo")}</strong><div className="muted small">{formatDate(p.photo_date)}</div></div></a>)}{photos.data?.length===0&&<div className="muted">{tr("Фотографий нет.","No progress photos.")}</div>}</div></section></div>
  </div></AppShell>;
}
