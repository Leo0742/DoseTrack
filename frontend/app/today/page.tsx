"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarClock, CalendarDays, Check, Clock3, Hourglass, SkipForward } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ProgressRing } from "@/components/progress-ring";
import { api, ApiError } from "@/lib/api";
import { useLanguage } from "@/lib/i18n";
import { isOverdue } from "@/lib/presentation";

type Intake = {
  id: string;
  date: string;
  slot_key: string;
  label: string;
  planned_time: string;
  planned_dose_mg: number;
  status: "PENDING" | "TAKEN" | "SKIPPED";
  actual_dose_mg: number | null;
  taken_at: string | null;
  skipped_reason: string | null;
};

type Today = {
  date: string;
  treatment: {
    name: string;
    medication_name: string;
    start_date: string;
    cumulative_mg: number;
    target_mg: number;
    remaining_mg: number;
    percent: number;
    daily_planned_mg: number;
    estimated_completion_date: string | null;
    estimated_days: number | null;
    estimate_label: string;
  };
  intakes: Intake[];
};

export default function TodayPage() {
  const qc = useQueryClient();
  const { tr, dateLocale, statusLabel } = useLanguage();
  const fmt = new Intl.NumberFormat(dateLocale, { maximumFractionDigits: 1 });
  const [doseFeedback,setDoseFeedback]=useState<number|null>(null);
  const today = useQuery({ queryKey: ["today"], queryFn: () => api<Today>("/api/today") });
  const resolve = useMutation({
    mutationFn: ({id, status}: {id: string; status: "TAKEN" | "SKIPPED"}) =>
      api<Intake>(`/api/intakes/${id}`, { method: "PUT", body: JSON.stringify({ status }) }),
    onSuccess: async (result,variables) => {
      if(variables.status==="TAKEN"){
        setDoseFeedback(result.actual_dose_mg??result.planned_dose_mg);
        window.setTimeout(()=>setDoseFeedback(null),1800);
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["today"] }),
        qc.invalidateQueries({ queryKey: ["progress"] })
      ]);
    }
  });

  const notConfigured = today.error instanceof ApiError && today.error.status === 404;

  return (
    <AppShell>
      <div className="page stack" style={{gap:20}}>
        <header className="page-head">
          <div>
            <div className="eyebrow">{tr("Сегодня", "Today")}</div>
            <h1>{today.data ? new Date(`${today.data.date}T12:00:00`).toLocaleDateString(dateLocale,{weekday:"long", month:"long", day:"numeric"}) : tr("Ваше лечение", "Your treatment")}</h1>
          </div>
        </header>

        {today.isLoading && <div className="skeleton" style={{height:250}}/>}
        {notConfigured && (
          <section className="card section">
            <h2>{tr("Настройка лечения", "Treatment setup")}</h2>
            <p className="muted">{tr("Сначала добавьте назначенное врачом лечение и текущую схему приёма.", "Add the clinician-directed treatment and current dose schedule before recording medication.")}</p>
            <a className="btn" href="/settings" style={{display:"inline-flex",alignItems:"center"}}>{tr("Открыть настройки", "Open settings")}</a>
          </section>
        )}
        {today.error && !notConfigured && <div className="error" role="alert">{today.error.message}</div>}

        {today.data && (
          <>
            <motion.section className="card progress-panel progress-panel-live" aria-label={tr("Прогресс лечения", "Treatment progress")} layout>
              <div>
                <div className="muted small">{tr("Суммарная доза", "Cumulative dose")}</div>
                <div className="dose-number tabular progress-dose-line" style={{marginTop:7}}><motion.span key={today.data.treatment.cumulative_mg} initial={{scale:1.04,opacity:.65}} animate={{scale:1,opacity:1}} transition={{duration:.35}}>{fmt.format(today.data.treatment.cumulative_mg)}</motion.span> <span className="muted" style={{fontSize:20,fontWeight:560}}>/ {fmt.format(today.data.treatment.target_mg)} mg</span></div>
                <div className="progress-track" aria-hidden="true"><motion.div className="progress-fill" initial={false} animate={{width:`${Math.min(today.data.treatment.percent,100)}%`}} transition={{duration:.72,ease:[.22,1,.36,1]}} /></div>
                <div className="progress-meta"><span>{fmt.format(today.data.treatment.percent)}% {tr("выполнено", "complete")}</span><span>{tr("осталось", "remaining")} {fmt.format(today.data.treatment.remaining_mg)} mg</span></div>
                <AnimatePresence>{doseFeedback!=null&&<motion.div className="dose-feedback" initial={{opacity:0,y:8,scale:.94}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:-6}}><Check size={15}/>+{fmt.format(doseFeedback)} mg · {tr("приём отмечен","dose recorded")}</motion.div>}</AnimatePresence>
              </div>
              <ProgressRing percent={today.data.treatment.percent} label={`${fmt.format(today.data.treatment.percent)}%`}/>
            </motion.section>

            <section>
              <div className="row between responsive-between" style={{marginBottom:10}}><h2>{tr("Назначенная схема на сегодня", "Today's prescribed schedule")}</h2><span className="muted small tabular">{fmt.format(today.data.treatment.daily_planned_mg)} mg {tr("по плану", "planned")}</span></div>
              <div className="card intake-list">
                {today.data.intakes.length === 0 && <div className="empty">{tr("На сегодня приёмов не запланировано.", "No doses are scheduled for today.")}</div>}
                {today.data.intakes.map(intake => {
                  const busy = resolve.isPending && resolve.variables?.id === intake.id;
                  const overdue = isOverdue(intake.status, intake.date, intake.planned_time, new Date());
                  return (
                    <motion.div layout className="intake-row" key={intake.id}>
                      <div>
                        <div className="intake-title">
                          <span className={`state-dot ${overdue ? "overdue" : intake.status.toLowerCase()}`}/>
                          <span>{intake.slot_key === "morning" ? tr("Утро", "Morning") : intake.slot_key === "evening" ? tr("Вечер", "Evening") : intake.label}</span>
                          <span className="tabular">{fmt.format(intake.planned_dose_mg)} mg</span>
                        </div>
                        <div className="row muted small" style={{marginTop:7}}><Clock3 size={14}/><span>{intake.planned_time.slice(0,5)}</span><span>·</span><span>{overdue ? tr("Просрочено", "Overdue") : statusLabel(intake.status)}</span></div>
                      </div>
                      {intake.status === "PENDING" ? (
                        <div className="actions">
                          <button className="btn" disabled={busy} onClick={()=>resolve.mutate({id:intake.id,status:"TAKEN"})}><Check size={17} style={{verticalAlign:"-3px",marginRight:6}}/>{tr("Принял", "Taken")}</button>
                          <button className="btn secondary" disabled={busy} onClick={()=>resolve.mutate({id:intake.id,status:"SKIPPED"})}><SkipForward size={17} style={{verticalAlign:"-3px",marginRight:6}}/>{tr("Пропустить", "Skip")}</button>
                        </div>
                      ) : (
                        <a className="btn secondary" href="/calendar">{tr("Открыть день", "View day")}</a>
                      )}
                    </motion.div>
                  );
                })}
              </div>
              {resolve.error && <div className="error" role="alert" style={{marginTop:10}}>{tr("Не удалось сохранить приём.", `Dose was not saved: ${resolve.error.message}`)}</div>}
            </section>

            <section className="grid-4">
              <div className="card metric"><div className="metric-label">{tr("Осталось", "Remaining")}</div><div className="metric-value tabular">{fmt.format(today.data.treatment.remaining_mg)} mg</div></div>
              <div className="card metric forecast-metric"><div className="metric-icon"><CalendarDays size={17}/></div><div><div className="metric-label">{tr("Дата начала курса", "Treatment start")}</div><div className="metric-value" style={{fontSize:18}}>{new Date(`${today.data.treatment.start_date}T12:00:00`).toLocaleDateString(dateLocale,{day:"numeric",month:"long",year:"numeric"})}</div><div className="muted small">{tr("Первый день лечения","First treatment day")}</div></div></div>
              <div className="card metric forecast-metric"><div className="metric-icon"><Hourglass size={17}/></div><div><div className="metric-label">{tr("Осталось по текущей схеме", "Time remaining")}</div><div className="metric-value tabular">{today.data.treatment.estimated_days==null?"—":`≈ ${today.data.treatment.estimated_days} ${tr("дн.","days")}`}</div><div className="muted small">{fmt.format(today.data.treatment.daily_planned_mg)} mg/{tr("день","day")}</div></div></div>
              <div className="card metric forecast-metric"><div className="metric-icon"><CalendarClock size={17}/></div><div><div className="metric-label">{tr("Ориентировочное завершение", "Estimated finish")}</div><div className="metric-value" style={{fontSize:18}}>{today.data.treatment.estimated_completion_date?new Date(`${today.data.treatment.estimated_completion_date}T12:00:00`).toLocaleDateString(dateLocale,{day:"numeric",month:"long",year:"numeric"}):tr("Нет данных", "Not available")}</div><div className="muted small">{tr("Если текущая схема не изменится","If the current regimen stays unchanged")}</div></div></div>
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
