"use client";

// Calendar page.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { CalendarDiary } from "@/components/calendar-diary";
import { api } from "@/lib/api";
import { useLanguage } from "@/lib/i18n";
import { calendarState } from "@/lib/presentation";

type CalendarRow={date:string;taken:number;skipped:number;pending:number;mg:number};
type Progress={calendar:CalendarRow[]};
type Intake={id:string;date:string;label:string;planned_time:string;planned_dose_mg:number;status:string;actual_dose_mg:number|null;taken_at:string|null;skipped_reason:string|null};

export default function CalendarPage(){
  const {tr,dateLocale,statusLabel}=useLanguage();
  const [cursor,setCursor]=useState(()=>new Date());
  const [selected,setSelected]=useState<string|null>(null);
  const progress=useQuery({queryKey:["progress"],queryFn:()=>api<Progress>("/api/progress")});
  const history=useQuery({queryKey:["day",selected],queryFn:()=>api<Intake[]>(`/api/history?start=${selected}&end=${selected}`),enabled:!!selected});
  const first=new Date(cursor.getFullYear(),cursor.getMonth(),1);
  const days=new Date(cursor.getFullYear(),cursor.getMonth()+1,0).getDate();
  const byDate=useMemo(()=>new Map((progress.data?.calendar??[]).map(x=>[x.date,x])),[progress.data]);
  const monthKey=`${cursor.getFullYear()}-${String(cursor.getMonth()+1).padStart(2,"0")}`;
  const monthStats=useMemo(()=>{
    const rows=(progress.data?.calendar??[]).filter(row=>row.date.startsWith(monthKey));
    const taken=rows.reduce((sum,row)=>sum+row.taken,0);
    const skipped=rows.reduce((sum,row)=>sum+row.skipped,0);
    const pending=rows.reduce((sum,row)=>sum+row.pending,0);
    const mg=rows.reduce((sum,row)=>sum+row.mg,0);
    const resolved=taken+skipped;
    return {taken,skipped,pending,mg,adherence:resolved?Math.round(taken/resolved*1000)/10:null};
  },[progress.data,monthKey]);
  const cells:Array<{day:number|null;iso?:string;row?:CalendarRow}>=[];
  const mondayIndex=(first.getDay()+6)%7;
  for(let i=0;i<mondayIndex;i++)cells.push({day:null});
  for(let day=1;day<=days;day++){
    const iso=`${cursor.getFullYear()}-${String(cursor.getMonth()+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    cells.push({day,iso,row:byDate.get(iso)});
  }
  function cls(row?:CalendarRow){const state=calendarState(row);return state==="none"?"":state;}
  return <AppShell><div className="page stack" style={{gap:20}}>
    <header className="page-head"><div><div className="eyebrow">{tr("Календарь","Calendar")}</div><h1>{tr("История по дням","Daily treatment record")}</h1></div></header>
    <section className="calendar-summary-grid">
      <div className="card metric"><div className="metric-label">{tr("Выпито за месяц","Taken this month")}</div><div className="metric-value tabular">{monthStats.mg.toLocaleString(dateLocale,{maximumFractionDigits:1})} mg</div></div>
      <div className="card metric"><div className="metric-label">{tr("Приёмов","Taken doses")}</div><div className="metric-value tabular">{monthStats.taken}</div></div>
      <div className="card metric"><div className="metric-label">{tr("Пропусков","Skipped doses")}</div><div className="metric-value tabular">{monthStats.skipped}</div></div>
      <div className="card metric"><div className="metric-label">{tr("Соблюдение","Adherence")}</div><div className="metric-value tabular">{monthStats.adherence==null?"—":`${monthStats.adherence.toLocaleString(dateLocale)}%`}</div></div>
    </section>
    <section className="card section">
      <div className="row between" style={{marginBottom:16}}><button className="btn secondary icon-btn" aria-label={tr("Предыдущий месяц","Previous month")} onClick={()=>setCursor(new Date(cursor.getFullYear(),cursor.getMonth()-1,1))}><ChevronLeft size={18}/></button><h2>{cursor.toLocaleDateString(dateLocale,{month:"long",year:"numeric"})}</h2><button className="btn secondary icon-btn" aria-label={tr("Следующий месяц","Next month")} onClick={()=>setCursor(new Date(cursor.getFullYear(),cursor.getMonth()+1,1))}><ChevronRight size={18}/></button></div>
      <div className="calendar-grid" style={{marginBottom:7}}>{(dateLocale==="ru-RU"?["Пн","Вт","Ср","Чт","Пт","Сб","Вс"]:["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]).map(d=><div key={d} className="muted small" style={{textAlign:"center"}}>{d}</div>)}</div>
      <div className="calendar-grid">{cells.map((cell,i)=>cell.day?<button key={cell.iso} className={`calendar-day ${cls(cell.row)}`} style={{cursor:"pointer",textAlign:"left"}} onClick={()=>setSelected(cell.iso!)}><span>{cell.day}</span><span className="day-dots">{cell.row&&[...Array(Math.min(cell.row.taken,3))].map((_,j)=><i key={`t${j}`} style={{background:"#2e7d5b"}}/>)}{cell.row&&[...Array(Math.min(cell.row.skipped,3))].map((_,j)=><i key={`s${j}`} style={{background:"#8b6c63"}}/>)}</span></button>:<div key={`e${i}`}/>)}</div>
    </section>
    {selected&&<section className="card section"><div className="row between responsive-between"><h2>{new Date(`${selected}T12:00:00`).toLocaleDateString(dateLocale,{weekday:"long",month:"long",day:"numeric"})}</h2><button className="btn secondary" onClick={()=>setSelected(null)}>{tr("Закрыть","Close")}</button></div>{history.isLoading?<div className="skeleton" style={{height:90,marginTop:16}}/>:<div className="stack" style={{marginTop:16}}>{history.data?.length?history.data.map(x=><div className="row between responsive-between" key={x.id}><div><strong>{x.label==="Morning"?tr("Утро","Morning"):x.label==="Evening"?tr("Вечер","Evening"):x.label}</strong><div className="muted small">{x.planned_time.slice(0,5)} · {statusLabel(x.status)}</div></div><div className="tabular">{x.status==="TAKEN"?`${x.actual_dose_mg} mg`:`${x.planned_dose_mg} mg ${tr("по плану","planned")}`}</div></div>):<div className="muted">{tr("На эту дату приёмов не запланировано.","No scheduled doses for this date.")}</div>}</div>}<CalendarDiary date={selected}/></section>}
  </div></AppShell>;
}
