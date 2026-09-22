"use client";

import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AppShell } from "@/components/app-shell";
import { api } from "@/lib/api";
import { useLanguage } from "@/lib/i18n";

type Progress = {
  summary: { cumulative_mg:number; target_mg:number; remaining_mg:number; percent:number; taken_doses:number; skipped_doses:number; adherence_percent:number|null };
  cumulative: {date:string;mg:number}[];
  monthly: {month:string;mg:number}[];
  calendar: {date:string;taken:number;skipped:number;pending:number;mg:number}[];
};

export default function ProgressPage() {
  const {tr,dateLocale}=useLanguage();
  const fmt = new Intl.NumberFormat(dateLocale, {maximumFractionDigits:1});
  const query = useQuery({queryKey:["progress"], queryFn:()=>api<Progress>("/api/progress")});
  return <AppShell><div className="page stack" style={{gap:20}}>
    <header className="page-head"><div><div className="eyebrow">{tr("Прогресс","Progress")}</div><h1>{tr("История лечения в цифрах","Treatment history at a glance")}</h1></div></header>
    {query.isLoading && <div className="skeleton" style={{height:300}}/>}
    {query.error && <div className="error">{query.error.message}</div>}
    {query.data && <>
      <section className="grid-3">
        <div className="card metric"><div className="metric-label">{tr("Суммарно","Cumulative")}</div><div className="metric-value tabular">{fmt.format(query.data.summary.cumulative_mg)} mg</div><div className="muted small">{tr("из","of")} {fmt.format(query.data.summary.target_mg)} mg</div></div>
        <div className="card metric"><div className="metric-label">{tr("Отмечено","Adherence")}</div><div className="metric-value tabular">{query.data.summary.adherence_percent == null ? "—" : `${query.data.summary.adherence_percent}%`}</div><div className="muted small">{query.data.summary.taken_doses} {tr("принято","taken")} · {query.data.summary.skipped_doses} {tr("пропущено","skipped")}</div></div>
        <div className="card metric"><div className="metric-label">{tr("Осталось","Remaining")}</div><div className="metric-value tabular">{fmt.format(query.data.summary.remaining_mg)} mg</div><div className="muted small">{tr("Считается только по отмеченным принятым дозам","Arithmetic from recorded TAKEN doses")}</div></div>
      </section>

      <section className="card section">
        <div className="row between" style={{marginBottom:18}}><h2>{tr("Накопленная доза","Cumulative dose")}</h2><span className="muted small">{tr("мг по времени","mg over time")}</span></div>
        <div style={{height:300}} aria-label={tr(`График накопленной дозы. Сейчас ${fmt.format(query.data.summary.cumulative_mg)} мг.`,`Cumulative dose chart. Latest total ${fmt.format(query.data.summary.cumulative_mg)} mg.`)}>
          <ResponsiveContainer width="100%" height="100%"><AreaChart data={query.data.cumulative} margin={{left:4,right:10,top:8,bottom:0}}>
            <defs><linearGradient id="doseFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2f6b5b" stopOpacity={0.22}/><stop offset="100%" stopColor="#2f6b5b" stopOpacity={0.02}/></linearGradient></defs>
            <CartesianGrid stroke="#e7e9e5" vertical={false}/><XAxis dataKey="date" tick={{fontSize:11,fill:"#6a6f73"}} axisLine={false} tickLine={false} minTickGap={28}/><YAxis tick={{fontSize:11,fill:"#6a6f73"}} axisLine={false} tickLine={false}/><Tooltip contentStyle={{border:"1px solid #e3e5e1",borderRadius:10,boxShadow:"0 8px 22px rgba(0,0,0,.06)"}}/><Area type="monotone" dataKey="mg" stroke="#2f6b5b" strokeWidth={2.25} fill="url(#doseFill)" animationDuration={500}/>
          </AreaChart></ResponsiveContainer>
        </div>
      </section>

      <section className="card section">
        <div className="row between" style={{marginBottom:18}}><h2>{tr("Приём по месяцам","Monthly intake")}</h2><span className="muted small">{tr("Только отмеченные принятые дозы","Recorded TAKEN doses")}</span></div>
        <div style={{height:240}} aria-label={tr("График приёма препарата по месяцам","Monthly medication intake chart")}>
          <ResponsiveContainer width="100%" height="100%"><BarChart data={query.data.monthly} margin={{left:4,right:10}}><CartesianGrid stroke="#e7e9e5" vertical={false}/><XAxis dataKey="month" tick={{fontSize:11,fill:"#6a6f73"}} axisLine={false} tickLine={false}/><YAxis tick={{fontSize:11,fill:"#6a6f73"}} axisLine={false} tickLine={false}/><Tooltip contentStyle={{border:"1px solid #e3e5e1",borderRadius:10}}/><Bar dataKey="mg" fill="#2f6b5b" radius={[6,6,2,2]} animationDuration={450}/></BarChart></ResponsiveContainer>
        </div>
      </section>
    </>}
  </div></AppShell>;
}
