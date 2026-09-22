"use client";

import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Download, KeyRound, Languages, LogOut, MessageCircle, ShieldCheck, Stethoscope, Weight } from "lucide-react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { api, ApiError } from "@/lib/api";
import { Locale, useLanguage } from "@/lib/i18n";

type SessionPayload={user:{id:string;email:string;username:string;role:string};csrf_token:string|null};
type Treatment={id:string;name:string;medication_name:string;start_date:string;status:string;target_mg:number;timezone:string;notes:string|null;cumulative_mg:number};
type Regimen={id:string;effective_from:string;effective_to:string|null;notes:string|null;slots:{slot_key:string;label:string;planned_time:string;dose_mg:number}[]};
type WeightRow={id:string;date:string;weight_kg:number;note:string|null};
type Reminder={morning_reminder:string;evening_reminder:string;timezone:string;direct_telegram_files:boolean};
type DoctorAccess={id:string;doctor_id:string;email:string;username:string;can_write:boolean};
type NotificationPref={event_type:string;telegram_enabled:boolean;direct_files:boolean};

export default function SettingsPage(){
  const me=useQuery({queryKey:["me"],queryFn:()=>api<SessionPayload>("/api/auth/me"),retry:false});
  if(me.isLoading)return <AppShell><div className="page"><div className="skeleton" style={{height:320}}/></div></AppShell>;
  return me.data?.user.role==="DOCTOR"?<DoctorSettings/>:<PatientSettings/>;
}

function PatientSettings(){
  const qc=useQueryClient();
  const router=useRouter();
  const {locale,setLocale,tr,statusLabel}=useLanguage();
  const treatment=useQuery({queryKey:["treatment"],queryFn:()=>api<Treatment>("/api/treatment"),retry:false});
  const regimens=useQuery({queryKey:["regimens"],queryFn:()=>api<Regimen[]>("/api/treatment/regimens"),retry:false});
  const weights=useQuery({queryKey:["weights"],queryFn:()=>api<WeightRow[]>("/api/weights")});
  const reminders=useQuery({queryKey:["reminders"],queryFn:()=>api<Reminder>("/api/settings/reminders")});
  const notificationPrefs=useQuery({queryKey:["notification-prefs"],queryFn:()=>api<NotificationPref[]>("/api/notification-preferences")});
  const language=useQuery({queryKey:["language"],queryFn:()=>api<{language:Locale}>("/api/settings/language")});
  const tg=useQuery({queryKey:["telegram"],queryFn:()=>api<{connected:boolean}>("/api/telegram/status")});
  const doctors=useQuery({queryKey:["doctors"],queryFn:()=>api<DoctorAccess[]>("/api/doctor/access"),retry:false});
  const missingTreatment=treatment.error instanceof ApiError&&treatment.error.status===404;

  const [course,setCourse]=useState({name:"Курс изотретиноина",medication_name:"Изотретиноин",start_date:"",target_mg:"",timezone:"Europe/Moscow",notes:""});
  const [target,setTarget]=useState("");
  const [regimen,setRegimen]=useState({effective_from:"",morning_time:"08:00",morning_mg:"16",evening_time:"20:00",evening_mg:"16"});
  const [weight,setWeight]=useState({date:new Date().toISOString().slice(0,10),kg:"",note:""});
  const [reminderForm,setReminderForm]=useState({morning:"11:00",evening:"23:00",timezone:"Europe/Moscow",direct:false});
  const [inviteEmail,setInviteEmail]=useState("");
  const [inviteToken,setInviteToken]=useState("");
  const [telegramCode,setTelegramCode]=useState("");
  const [pw,setPw]=useState({current:"",next:""});
  const [message,setMessage]=useState("");
  const [exportMode,setExportMode]=useState<"all"|"30"|"custom">("all");
  const [exportStart,setExportStart]=useState("");
  const [exportEnd,setExportEnd]=useState("");

  useEffect(()=>{if(treatment.data){setTarget(String(treatment.data.target_mg));setRegimen(v=>({...v,effective_from:v.effective_from||new Date().toISOString().slice(0,10)}));}},[treatment.data]);
  useEffect(()=>{if(reminders.data)setReminderForm({morning:reminders.data.morning_reminder.slice(0,5),evening:reminders.data.evening_reminder.slice(0,5),timezone:reminders.data.timezone,direct:reminders.data.direct_telegram_files});},[reminders.data]);
  useEffect(()=>{if(language.data?.language&&language.data.language!==locale)setLocale(language.data.language);},[language.data,locale,setLocale]);

  const createCourse=useMutation({mutationFn:()=>api<Treatment>("/api/treatments",{method:"POST",body:JSON.stringify({...course,target_mg:Number(course.target_mg),notes:course.notes||null})}),onSuccess:()=>{qc.invalidateQueries({queryKey:["treatment"]});qc.invalidateQueries({queryKey:["today"]});setMessage(tr("Лечение создано. Теперь добавьте назначенную схему приёма.","Treatment created. Add the prescribed dose schedule below."));}});
  const changeTarget=useMutation({mutationFn:()=>api<Treatment>("/api/treatment/target",{method:"PATCH",body:JSON.stringify({target_mg:Number(target),confirmed:true})}),onSuccess:()=>{qc.invalidateQueries({queryKey:["treatment"]});qc.invalidateQueries({queryKey:["today"]});setMessage(tr("Целевая суммарная доза обновлена.","Target updated."));}});
  const addRegimen=useMutation({mutationFn:()=>api<Regimen>("/api/treatment/regimens",{method:"POST",body:JSON.stringify({effective_from:regimen.effective_from,slots:[{slot_key:"morning",label:"Morning",planned_time:regimen.morning_time,dose_mg:Number(regimen.morning_mg)},{slot_key:"evening",label:"Evening",planned_time:regimen.evening_time,dose_mg:Number(regimen.evening_mg)}]})}),onSuccess:()=>{qc.invalidateQueries({queryKey:["regimens"]});qc.invalidateQueries({queryKey:["today"]});qc.invalidateQueries({queryKey:["progress"]});setMessage(tr("Схема сохранена. Уже отмеченная история не изменена.","Dose schedule saved. Resolved history was preserved."));}});
  const addWeight=useMutation({mutationFn:()=>api("/api/weights",{method:"POST",body:JSON.stringify({recorded_date:weight.date,weight_kg:Number(weight.kg),note:weight.note||null})}),onSuccess:()=>{qc.invalidateQueries({queryKey:["weights"]});qc.invalidateQueries({queryKey:["profile"]});setWeight(v=>({...v,kg:"",note:""}));setMessage(tr("История веса обновлена.","Weight history updated."));}});
  const saveReminder=useMutation({mutationFn:()=>api("/api/settings/reminders",{method:"PUT",body:JSON.stringify({morning_reminder:reminderForm.morning,evening_reminder:reminderForm.evening,timezone:reminderForm.timezone,direct_telegram_files:reminderForm.direct})}),onSuccess:()=>{qc.invalidateQueries({queryKey:["reminders"]});setMessage(tr("Настройки сохранены.","Settings saved."));}});
  const saveNotification=useMutation({mutationFn:(pref:NotificationPref)=>api("/api/notification-preferences",{method:"PUT",body:JSON.stringify(pref)}),onSuccess:()=>qc.invalidateQueries({queryKey:["notification-prefs"]})});
  const saveLanguage=useMutation({mutationFn:(next:Locale)=>api<{language:Locale}>("/api/settings/language",{method:"PUT",body:JSON.stringify({language:next})}),onSuccess:r=>{setLocale(r.language);qc.setQueryData(["language"],r);}});
  const linkCode=useMutation({mutationFn:()=>api<{code:string;expires_at:string}>("/api/telegram/link-code",{method:"POST"}),onSuccess:r=>setTelegramCode(r.code)});
  const disconnectTelegram=useMutation({mutationFn:()=>api("/api/telegram",{method:"DELETE"}),onSuccess:()=>{qc.invalidateQueries({queryKey:["telegram"]});setTelegramCode("");}});
  const invite=useMutation({mutationFn:()=>api<{invite_token:string}>("/api/doctor/invites",{method:"POST",body:JSON.stringify({email:inviteEmail})}),onSuccess:r=>setInviteToken(r.invite_token)});
  const revoke=useMutation({mutationFn:(id:string)=>api(`/api/doctor/access/${id}`,{method:"DELETE"}),onSuccess:()=>qc.invalidateQueries({queryKey:["doctors"]})});
  const changeStatus=useMutation({mutationFn:(status:string)=>api<Treatment>("/api/treatment/status",{method:"PATCH",body:JSON.stringify({status,effective_date:new Date().toISOString().slice(0,10),confirmed:true})}),onSuccess:()=>{qc.invalidateQueries({queryKey:["treatment"]});qc.invalidateQueries({queryKey:["today"]});qc.invalidateQueries({queryKey:["progress"]});}});
  const password=useMutation({mutationFn:()=>api("/api/auth/change-password",{method:"POST",body:JSON.stringify({current_password:pw.current,new_password:pw.next})}),onSuccess:()=>{sessionStorage.removeItem("dosetrack_csrf");router.replace("/login");}});
  const logout=useMutation({mutationFn:()=>api("/api/auth/logout",{method:"POST"}),onSuccess:()=>{sessionStorage.removeItem("dosetrack_csrf");router.replace("/login");}});
  const pref=(type:string)=>notificationPrefs.data?.find(p=>p.event_type===type)??{event_type:type,telegram_enabled:true,direct_files:false};
  const morningPref=pref("dose_reminder_morning");
  const eveningPref=pref("dose_reminder_evening");
  const toggleReminder=(p:NotificationPref)=>saveNotification.mutate({...p,telegram_enabled:!p.telegram_enabled,direct_files:false});
  const slotLabel=(slot:{slot_key:string;label:string})=>slot.slot_key==="morning"?tr("Утро","Morning"):slot.slot_key==="evening"?tr("Вечер","Evening"):slot.label;
  const exportParams=new URLSearchParams({lang:locale});
  if(exportMode==="30"){
    const finish=new Date(); const begin=new Date(); begin.setDate(begin.getDate()-29);
    exportParams.set("start",begin.toISOString().slice(0,10)); exportParams.set("end",finish.toISOString().slice(0,10));
  }
  if(exportMode==="custom"){
    if(exportStart)exportParams.set("start",exportStart);
    if(exportEnd)exportParams.set("end",exportEnd);
  }
  const exportHref=`/api/export/medication.xlsx?${exportParams.toString()}`;

  return <AppShell><div className="page stack" style={{gap:20}}>
    <header className="page-head"><div><div className="eyebrow">{tr("Настройки","Settings")}</div><h1>{tr("Лечение и уведомления","Treatment and notifications")}</h1></div></header>
    {message&&<div className="notice">{message}</div>}

    {missingTreatment&&<form className="card section stack" onSubmit={(e:FormEvent)=>{e.preventDefault();createCourse.mutate();}}><h2>{tr("Настройка лечения","Treatment setup")}</h2><p className="muted small">{tr("Введите только данные, назначенные врачом. DoseTrack хранит их и считает статистику, но не рекомендует дозировку.","Enter only clinician-directed treatment information. DoseTrack stores it but does not recommend a dose.")}</p><div className="form-grid"><div className="field"><label>{tr("Название курса","Treatment name")}</label><input className="input" value={course.name} onChange={e=>setCourse({...course,name:e.target.value})} required/></div><div className="field"><label>{tr("Препарат","Medication")}</label><input className="input" value={course.medication_name} onChange={e=>setCourse({...course,medication_name:e.target.value})} required/></div><div className="field"><label>{tr("Дата начала","Start date")}</label><input className="input" aria-label={tr("Дата начала","Start date")} type="date" value={course.start_date} onChange={e=>setCourse({...course,start_date:e.target.value})} required/></div><div className="field"><label>{tr("Целевая суммарная доза, мг","Cumulative target, mg")}</label><input className="input" aria-label={tr("Целевая суммарная доза, мг","Cumulative target, mg")} type="number" min="0.001" step="0.001" value={course.target_mg} onChange={e=>setCourse({...course,target_mg:e.target.value})} required/></div><div className="field"><label>{tr("Часовой пояс","Timezone")}</label><input className="input" value={course.timezone} onChange={e=>setCourse({...course,timezone:e.target.value})} required/></div></div><div className="form-actions"><button className="btn" disabled={createCourse.isPending}>{tr("Создать лечение","Create treatment")}</button></div></form>}

    {treatment.data&&<section className="card section stack"><div className="row between responsive-between"><div><div className="section-kicker">{tr("Лечение","Treatment")}</div><h2>{treatment.data.medication_name}</h2><div className="muted small">{tr("начато","started")} {treatment.data.start_date} · {statusLabel(treatment.data.status)}</div></div>{treatment.data.status==="PAUSED"?<button className="btn secondary" onClick={()=>changeStatus.mutate("ACTIVE")}>{tr("Возобновить","Resume")}</button>:<button className="btn secondary" onClick={()=>changeStatus.mutate("PAUSED")}>{tr("Приостановить учёт","Pause tracking")}</button>}</div><div className="form-grid"><div className="field"><label>{tr("Целевая суммарная доза, мг","Cumulative target, mg")}</label><input className="input" type="number" min="0.001" step="0.001" value={target} onChange={e=>setTarget(e.target.value)}/></div><div className="field"><label>{tr("Уже отмечено","Recorded total")}</label><input className="input" value={`${treatment.data.cumulative_mg} mg`} disabled/></div></div><div className="form-actions"><button className="btn secondary" onClick={()=>changeTarget.mutate()}>{tr("Обновить цель","Update target")}</button></div></section>}

    {treatment.data&&<form className="card section stack" onSubmit={(e:FormEvent)=>{e.preventDefault();addRegimen.mutate();}}><div><div className="section-kicker">{tr("Схема приёма","Dose schedule")}</div><h2>{tr("Текущая назначенная схема","Current prescribed regimen")}</h2></div><div className="form-grid"><div className="field"><label>{tr("Действует с","Effective from")}</label><input className="input" aria-label={tr("Действует с","Effective from")} type="date" value={regimen.effective_from} onChange={e=>setRegimen({...regimen,effective_from:e.target.value})} required/></div><div/><div className="field"><label>{tr("Утро — время","Morning time")}</label><input className="input" type="time" value={regimen.morning_time} onChange={e=>setRegimen({...regimen,morning_time:e.target.value})}/></div><div className="field"><label>{tr("Утро — мг","Morning mg")}</label><input className="input" aria-label={tr("Утро — мг","Morning mg")} type="number" min="0" step="0.001" value={regimen.morning_mg} onChange={e=>setRegimen({...regimen,morning_mg:e.target.value})}/></div><div className="field"><label>{tr("Вечер — время","Evening time")}</label><input className="input" type="time" value={regimen.evening_time} onChange={e=>setRegimen({...regimen,evening_time:e.target.value})}/></div><div className="field"><label>{tr("Вечер — мг","Evening mg")}</label><input className="input" aria-label={tr("Вечер — мг","Evening mg")} type="number" min="0" step="0.001" value={regimen.evening_mg} onChange={e=>setRegimen({...regimen,evening_mg:e.target.value})}/></div></div><div className="form-actions"><button className="btn">{tr("Сохранить схему","Save schedule")}</button></div>{regimens.data?.length?<div className="divider"/>:null}{regimens.data?.slice(0,3).map(r=><div className="row between responsive-between" key={r.id}><div><strong>{tr("С","From")} {r.effective_from}</strong><div className="muted small">{r.slots.map(s=>`${slotLabel(s)} ${s.dose_mg} mg · ${s.planned_time.slice(0,5)}`).join(" · ")}</div></div>{r.effective_to&&<span className="muted small">{tr("до","until")} {r.effective_to}</span>}</div>)}</form>}

    <section id="weight" className="card section stack"><div className="row"><Weight size={19}/><h2>{tr("История веса","Weight history")}</h2></div><form className="form-grid" onSubmit={(e:FormEvent)=>{e.preventDefault();addWeight.mutate();}}><div className="field"><label>{tr("Дата","Date")}</label><input className="input" type="date" value={weight.date} onChange={e=>setWeight({...weight,date:e.target.value})}/></div><div className="field"><label>{tr("Вес, кг","Weight, kg")}</label><input className="input" type="number" min="1" max="499" step="0.1" value={weight.kg} onChange={e=>setWeight({...weight,kg:e.target.value})} required/></div><div className="field" style={{gridColumn:"1/-1"}}><label>{tr("Заметка","Note")}</label><input className="input" value={weight.note} onChange={e=>setWeight({...weight,note:e.target.value})}/></div><div className="form-actions" style={{gridColumn:"1/-1"}}><button className="btn">{tr("Добавить вес","Add weight")}</button></div></form><div className="weight-history-mini">{weights.data?.slice(0,5).map(w=><div key={w.id}><span>{w.date}</span><strong>{w.weight_kg} kg</strong></div>)}</div></section>

    <section className="card section stack"><div className="row"><Bell size={19}/><h2>{tr("Мои напоминания в Telegram","My Telegram reminders")}</h2></div><p className="muted small" style={{margin:0}}>{tr("Утро и вечер можно включать независимо. Время срабатывания задаётся рядом.","Morning and evening reminders can be enabled independently. Set the delivery time next to each one.")}</p><div className="notification-pref-list"><div className="notification-pref-row"><div><strong>{tr("Утренний приём","Morning dose")}</strong><div className="muted small">{tr("Напомнить, если утренняя доза ещё не отмечена.","Remind me if the morning dose is still unrecorded.")}</div></div><div className="pref-controls"><input className="input reminder-time" type="time" value={reminderForm.morning} onChange={e=>setReminderForm({...reminderForm,morning:e.target.value})}/><button className={`pref-button ${morningPref.telegram_enabled?"active":""}`} onClick={()=>toggleReminder(morningPref)}>{morningPref.telegram_enabled?tr("Включено","On"):tr("Выключено","Off")}</button></div></div><div className="notification-pref-row"><div><strong>{tr("Вечерний приём","Evening dose")}</strong><div className="muted small">{tr("Напомнить, если вечерняя доза ещё не отмечена.","Remind me if the evening dose is still unrecorded.")}</div></div><div className="pref-controls"><input className="input reminder-time" type="time" value={reminderForm.evening} onChange={e=>setReminderForm({...reminderForm,evening:e.target.value})}/><button className={`pref-button ${eveningPref.telegram_enabled?"active":""}`} onClick={()=>toggleReminder(eveningPref)}>{eveningPref.telegram_enabled?tr("Включено","On"):tr("Выключено","Off")}</button></div></div></div><div className="field" style={{maxWidth:360}}><label>{tr("Часовой пояс","Timezone")}</label><input className="input" value={reminderForm.timezone} onChange={e=>setReminderForm({...reminderForm,timezone:e.target.value})}/></div><div className="form-actions"><button className="btn" onClick={()=>saveReminder.mutate()}>{tr("Сохранить время","Save times")}</button></div></section>

    <TelegramSection tgConnected={!!tg.data?.connected} telegramCode={telegramCode} onLink={()=>linkCode.mutate()} onDisconnect={()=>disconnectTelegram.mutate()} tr={tr}/>

    <section className="card section stack"><div className="row"><Stethoscope size={19}/><h2>{tr("Доступ врачу","Doctor access")}</h2></div><p className="muted small" style={{margin:0}}>{tr("Врач получает отдельный аккаунт с собственным логином и паролем. Доступ к лечению остаётся только для чтения.","The doctor gets a separate account with their own credentials. Treatment access remains read only.")}</p><div className="row responsive-form-row"><div className="field" style={{flex:1}}><label>{tr("Email врача","Doctor email")}</label><input className="input" type="email" value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)} placeholder="doctor@example.com"/></div><button className="btn" onClick={()=>invite.mutate()} disabled={!inviteEmail}>{tr("Создать приглашение","Create invite")}</button></div>{inviteToken&&<div className="notice">{tr("Одноразовый токен:","One-time token:")} <strong>{inviteToken}</strong> · <strong>/invite</strong></div>}<label className="permission-row"><input type="checkbox" checked={reminderForm.direct} onChange={e=>setReminderForm({...reminderForm,direct:e.target.checked})}/><span><strong>{tr("Разрешить прямую отправку файлов врачу","Allow direct file delivery to doctor")}</strong><small>{tr("Сам файл уйдёт в Telegram только если врач тоже включил получение файлов.","The actual file is sent only if the doctor also enables file delivery.")}</small></span></label><div className="form-actions"><button className="btn secondary" onClick={()=>saveReminder.mutate()}>{tr("Сохранить разрешение","Save permission")}</button></div>{doctors.data?.map(d=><div className="doctor-access-row" key={d.id}><div><strong>{d.username}</strong><span>{d.email} · {tr("только чтение","read only")}</span></div><button className="btn danger" onClick={()=>revoke.mutate(d.id)}>{tr("Отозвать","Revoke")}</button></div>)}</section>

    <section className="card section stack"><div className="row"><Download size={19}/><h2>{tr("Экспорт данных","Data export")}</h2></div><p className="muted small" style={{margin:0}}>{tr("Excel формируется как полноценная выписка: приёмы и пропуски, фактическая и плановая доза, накопленная сумма, остаток, вес, схемы лечения и текущий прогноз завершения.","Excel is generated as a full treatment statement with taken and skipped doses, planned and actual dose, cumulative total, remaining amount, weight, regimen history and current completion forecast.")}</p><div className="export-period"><div className="field"><label>{tr("Период выписки","Statement period")}</label><select className="select" aria-label={tr("Период выписки","Statement period")} value={exportMode} onChange={e=>setExportMode(e.target.value as "all"|"30"|"custom")}><option value="all">{tr("Всё лечение","Full treatment")}</option><option value="30">{tr("Последние 30 дней","Last 30 days")}</option><option value="custom">{tr("Свой период","Custom range")}</option></select></div>{exportMode==="custom"&&<><div className="field"><label>{tr("С","From")}</label><input className="input" aria-label={tr("С","From")} type="date" value={exportStart} onChange={e=>setExportStart(e.target.value)}/></div><div className="field"><label>{tr("По","To")}</label><input className="input" aria-label={tr("По","To")} type="date" value={exportEnd} onChange={e=>setExportEnd(e.target.value)}/></div></>}</div><div className="row wrap export-actions"><a className={`btn ${exportMode==="custom"&&(!exportStart||!exportEnd)?"disabled-link":""}`} aria-disabled={exportMode==="custom"&&(!exportStart||!exportEnd)} href={exportMode==="custom"&&(!exportStart||!exportEnd)?undefined:exportHref}>{tr("Скачать Excel-выписку","Download Excel statement")}</a><a className="btn secondary" href="/api/export/medication">{tr("Приём CSV","Medication CSV")}</a><a className="btn secondary" href="/api/export/weights">{tr("Вес CSV","Weight CSV")}</a><a className="btn secondary" href="/api/export/diary">{tr("Дневник CSV","Diary CSV")}</a></div></section>

    <LanguageAndSecurity locale={locale} saveLanguage={(v)=>saveLanguage.mutate(v)} pw={pw} setPw={setPw} changePassword={()=>password.mutate()} logout={()=>logout.mutate()} tr={tr}/>
  </div></AppShell>;
}

function DoctorSettings(){
  const qc=useQueryClient();
  const router=useRouter();
  const {locale,setLocale,tr}=useLanguage();
  const language=useQuery({queryKey:["language"],queryFn:()=>api<{language:Locale}>("/api/settings/language")});
  const tg=useQuery({queryKey:["telegram"],queryFn:()=>api<{connected:boolean}>("/api/telegram/status")});
  const prefs=useQuery({queryKey:["doctor-notification-prefs"],queryFn:()=>api<NotificationPref[]>("/api/notification-preferences")});
  const [telegramCode,setTelegramCode]=useState("");
  const [pw,setPw]=useState({current:"",next:""});
  useEffect(()=>{if(language.data?.language&&language.data.language!==locale)setLocale(language.data.language);},[language.data,locale,setLocale]);
  const saveLanguage=useMutation({mutationFn:(next:Locale)=>api<{language:Locale}>("/api/settings/language",{method:"PUT",body:JSON.stringify({language:next})}),onSuccess:r=>{setLocale(r.language);qc.setQueryData(["language"],r);}});
  const savePrefs=useMutation({mutationFn:(items:NotificationPref[])=>Promise.all(items.map(p=>api("/api/notification-preferences",{method:"PUT",body:JSON.stringify(p)}))),onSuccess:()=>qc.invalidateQueries({queryKey:["doctor-notification-prefs"]})});
  const linkCode=useMutation({mutationFn:()=>api<{code:string}>("/api/telegram/link-code",{method:"POST"}),onSuccess:r=>setTelegramCode(r.code)});
  const disconnect=useMutation({mutationFn:()=>api("/api/telegram",{method:"DELETE"}),onSuccess:()=>{qc.invalidateQueries({queryKey:["telegram"]});setTelegramCode("");}});
  const password=useMutation({mutationFn:()=>api("/api/auth/change-password",{method:"POST",body:JSON.stringify({current_password:pw.current,new_password:pw.next})}),onSuccess:()=>{sessionStorage.removeItem("dosetrack_csrf");router.replace("/login");}});
  const logout=useMutation({mutationFn:()=>api("/api/auth/logout",{method:"POST"}),onSuccess:()=>{sessionStorage.removeItem("dosetrack_csrf");router.replace("/login");}});
  const pref=(type:string)=>prefs.data?.find(p=>p.event_type===type)??{event_type:type,telegram_enabled:true,direct_files:false};
  const taken=pref("dose_taken"), skipped=pref("dose_skipped"), docs=pref("document_uploaded"), photos=pref("photo_uploaded"), regimen=pref("regimen_changed"), target=pref("target_changed");
  const dosesOn=taken.telegram_enabled&&skipped.telegram_enabled;
  const treatmentOn=regimen.telegram_enabled&&target.telegram_enabled;
  const toggle=(p:NotificationPref)=>savePrefs.mutate([{...p,telegram_enabled:!p.telegram_enabled,direct_files:p.telegram_enabled?false:p.direct_files}]);
  const toggleDirect=(p:NotificationPref)=>savePrefs.mutate([{...p,direct_files:!p.direct_files}]);

  return <AppShell><div className="page stack" style={{gap:20}}>
    <header className="page-head"><div><div className="eyebrow">{tr("Настройки","Settings")}</div><h1>{tr("Кабинет врача","Doctor workspace")}</h1><p className="muted doctor-subtitle">{tr("Здесь только настройки вашего аккаунта и уведомлений. Данные пациента находятся в разделе «Обзор пациента».","Only your account and notification settings live here. Patient data stays in Patient overview.")}</p></div></header>
    <TelegramSection tgConnected={!!tg.data?.connected} telegramCode={telegramCode} onLink={()=>linkCode.mutate()} onDisconnect={()=>disconnect.mutate()} tr={tr}/>
    <section className="card section stack"><div className="row"><Bell size={19}/><h2>{tr("Уведомления врача","Doctor notifications")}</h2></div><p className="muted small" style={{margin:0}}>{tr("Выберите, какие события пациента должны приходить в ваш Telegram.","Choose which patient events should reach your Telegram.")}</p><div className="notification-pref-list">
      <PrefRow title={tr("Приём и пропуск дозы","Taken and skipped doses")} description={tr("Сообщать, когда пациент отметил дозу.","Notify when the patient records a dose.")} controls={<button className={`pref-button ${dosesOn?"active":""}`} onClick={()=>savePrefs.mutate([{...taken,telegram_enabled:!dosesOn,direct_files:false},{...skipped,telegram_enabled:!dosesOn,direct_files:false}])}>{dosesOn?tr("Включено","On"):tr("Выключено","Off")}</button>}/>
      <PrefRow title={tr("Документы","Documents")} description={tr("Новый документ пациента.","A new patient document.")} controls={<><button className={`pref-button ${docs.telegram_enabled?"active":""}`} onClick={()=>toggle(docs)}>{docs.telegram_enabled?tr("Telegram: вкл","Telegram: on"):tr("Telegram: выкл","Telegram: off")}</button><button className={`pref-button ${docs.direct_files?"active":""}`} disabled={!docs.telegram_enabled} onClick={()=>toggleDirect(docs)}>{docs.direct_files?tr("Файл: вкл","File: on"):tr("Файл: выкл","File: off")}</button></>}/>
      <PrefRow title={tr("Фото прогресса","Progress photos")} description={tr("Новое фото пациента.","A new patient progress photo.")} controls={<><button className={`pref-button ${photos.telegram_enabled?"active":""}`} onClick={()=>toggle(photos)}>{photos.telegram_enabled?tr("Telegram: вкл","Telegram: on"):tr("Telegram: выкл","Telegram: off")}</button><button className={`pref-button ${photos.direct_files?"active":""}`} disabled={!photos.telegram_enabled} onClick={()=>toggleDirect(photos)}>{photos.direct_files?tr("Фото: вкл","Photo: on"):tr("Фото: выкл","Photo: off")}</button></>}/>
      <PrefRow title={tr("Изменения лечения","Treatment changes")} description={tr("Новая схема приёма или изменение целевой дозы.","A new regimen or target-dose change.")} controls={<button className={`pref-button ${treatmentOn?"active":""}`} onClick={()=>savePrefs.mutate([{...regimen,telegram_enabled:!treatmentOn,direct_files:false},{...target,telegram_enabled:!treatmentOn,direct_files:false}])}>{treatmentOn?tr("Включено","On"):tr("Выключено","Off")}</button>}/>
    </div></section>
    <LanguageAndSecurity locale={locale} saveLanguage={(v)=>saveLanguage.mutate(v)} pw={pw} setPw={setPw} changePassword={()=>password.mutate()} logout={()=>logout.mutate()} tr={tr}/>
  </div></AppShell>;
}

function TelegramSection({tgConnected,telegramCode,onLink,onDisconnect,tr}:{tgConnected:boolean;telegramCode:string;onLink:()=>void;onDisconnect:()=>void;tr:(ru:string,en:string)=>string}){
  return <section className="card section stack"><div className="row"><MessageCircle size={19}/><h2>Telegram</h2><span className={`connection-pill ${tgConnected?"connected":""}`}>{tgConnected?tr("Подключён","Connected"):tr("Не подключён","Not connected")}</span></div><p className="muted small" style={{margin:0}}>{tr("Создайте короткий код и отправьте боту DoseTrack команду","Generate a short code, then send the DoseTrack bot")} <code>/start CODE</code>.</p><div className="row wrap"><button className="btn secondary" onClick={onLink}>{tr("Создать код подключения","Generate link code")}</button>{tgConnected&&<button className="btn danger" onClick={onDisconnect}>{tr("Отключить","Disconnect")}</button>}{telegramCode&&<strong className="telegram-code">{telegramCode}</strong>}</div></section>;
}

function PrefRow({title,description,controls}:{title:string;description:string;controls:React.ReactNode}){
  return <div className="notification-pref-row"><div><strong>{title}</strong><div className="muted small">{description}</div></div><div className="pref-controls">{controls}</div></div>;
}

function LanguageAndSecurity({locale,saveLanguage,pw,setPw,changePassword,logout,tr}:{locale:Locale;saveLanguage:(v:Locale)=>void;pw:{current:string;next:string};setPw:(v:{current:string;next:string})=>void;changePassword:()=>void;logout:()=>void;tr:(ru:string,en:string)=>string}){
  return <>
    <section className="card section stack"><div className="row"><Languages size={19}/><h2>{tr("Язык интерфейса","Interface language")}</h2></div><div className="field" style={{maxWidth:360}}><label>{tr("Язык","Language")}</label><select className="select" aria-label={tr("Язык","Language")} value={locale} onChange={e=>saveLanguage(e.target.value as Locale)}><option value="ru">Русский</option><option value="en">English</option></select></div></section>
    <section className="card section stack"><div className="row"><ShieldCheck size={19}/><h2>{tr("Безопасность","Security")}</h2></div><div className="form-grid"><div className="field"><label>{tr("Текущий пароль","Current password")}</label><input className="input" type="password" value={pw.current} onChange={e=>setPw({...pw,current:e.target.value})}/></div><div className="field"><label>{tr("Новый пароль","New password")}</label><input className="input" type="password" minLength={10} value={pw.next} onChange={e=>setPw({...pw,next:e.target.value})}/></div></div><div className="row between responsive-between"><button className="btn secondary" disabled={!pw.current||pw.next.length<10} onClick={changePassword}><KeyRound size={16}/>{tr("Изменить пароль","Change password")}</button><button className="btn danger" onClick={logout}><LogOut size={16}/>{tr("Выйти","Sign out")}</button></div></section>
  </>;
}
