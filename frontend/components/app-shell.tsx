"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Activity, BookOpenText, CalendarDays, FileText, Images, LayoutDashboard,
  MoreHorizontal, Settings, SunMedium, TrendingUp, UserRound
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Image from "next/image";
import { api, ApiError } from "@/lib/api";
import { Locale, useLanguage } from "@/lib/i18n";

type User = { id: string; email: string; username: string; role: string; first_name?: string | null; last_name?: string | null; has_avatar?: boolean };
type SessionPayload = { user: User; csrf_token: string | null };

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const { tr, setLocale } = useLanguage();
  const session = useQuery({ queryKey: ["me"], queryFn: () => api<SessionPayload>("/api/auth/me"), retry: false });
  const language = useQuery({
    queryKey: ["language"],
    queryFn: () => api<{language: Locale}>("/api/settings/language"),
    enabled: !!session.data,
    retry: false
  });
  const isDoctor = session.data?.user.role === "DOCTOR";
  const mobileMoreActive = (isDoctor
    ? ["/diary", "/settings"]
    : ["/diary", "/documents", "/photos", "/settings"]
  ).some((route) => pathname.startsWith(route));
  const nav = isDoctor
    ? [
        ["/doctor", tr("Обзор пациента", "Patient overview"), LayoutDashboard],
        ["/calendar", tr("История приёма", "Medication history"), CalendarDays],
        ["/diary", tr("Дневник", "Diary"), BookOpenText],
        ["/documents", tr("Документы", "Documents"), FileText],
        ["/photos", tr("Фото", "Photos"), Images]
      ] as const
    : [
        ["/today", tr("Сегодня", "Today"), SunMedium],
        ["/progress", tr("Прогресс", "Progress"), TrendingUp],
        ["/calendar", tr("Календарь", "Calendar"), CalendarDays],
        ["/diary", tr("Дневник", "Diary"), BookOpenText],
        ["/documents", tr("Документы", "Documents"), FileText],
        ["/photos", tr("Фото", "Photos"), Images],
        ["/profile", tr("Профиль", "Profile"), UserRound]
      ] as const;

  useEffect(() => {
    if (session.error instanceof ApiError && session.error.status === 401) router.replace("/login");
    if (session.data?.csrf_token) sessionStorage.setItem("dosetrack_csrf", session.data.csrf_token);
  }, [session.error, session.data, router]);

  useEffect(() => {
    if (language.data?.language) setLocale(language.data.language);
  }, [language.data, setLocale]);

  useEffect(() => {
    if (!session.data) return;
    const isDoctor = session.data.user.role === "DOCTOR";
    if (isDoctor && ["/today", "/progress", "/profile"].some((route) => pathname.startsWith(route))) {
      router.replace("/doctor");
    }
    if (!isDoctor && pathname.startsWith("/doctor")) {
      router.replace("/today");
    }
  }, [pathname, router, session.data]);

  if (session.isLoading) {
    return <main className="content"><div className="page stack"><div className="skeleton" style={{height: 46, width: 220}}/><div className="skeleton" style={{height: 240}}/></div></main>;
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark"><Activity size={18}/></span>DoseTrack</div>
        <nav className="nav" aria-label={tr("Основная навигация", "Primary navigation")}>
          {nav.map(([href, label, Icon]) => (
            <a key={href} className={"nav-link " + (pathname.startsWith(href) ? "active" : "")} href={href}>
              <Icon size={18} strokeWidth={1.9}/><span>{label}</span>
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-user">
            <div className="sidebar-avatar">
              {session.data?.user.has_avatar?<Image unoptimized width={34} height={34} src="/api/auth/avatar" alt={tr("Аватар","Avatar")}/>:((session.data?.user.first_name?.[0] ?? session.data?.user.username?.[0] ?? "D").toUpperCase())}
            </div>
            <div className="sidebar-user-copy">
              <strong>{session.data?.user.first_name || session.data?.user.username}</strong>
              <span>{isDoctor ? tr("Врач", "Doctor") : tr("Пациент", "Patient")}</span>
            </div>
          </div>
          <a className={"nav-link " + (pathname.startsWith("/settings") ? "active" : "")} href="/settings">
            <Settings size={18}/><span>{tr("Настройки", "Settings")}</span>
          </a>
        </div>
      </aside>
      <main className="content">{children}</main>
      {mobileMoreOpen && <div className="mobile-more-layer">
        <button className="mobile-more-backdrop" type="button" aria-label={tr("Закрыть меню", "Close menu")} onClick={()=>setMobileMoreOpen(false)}/>
        <section className="mobile-more-sheet" id="mobile-more-menu" aria-label={tr("Другие разделы", "More sections")}>
          <div className="mobile-more-head">
            <strong>{tr("Ещё", "More")}</strong>
            <button className="mobile-more-close" type="button" onClick={()=>setMobileMoreOpen(false)}>{tr("Закрыть", "Close")}</button>
          </div>
          <div className="mobile-more-links">
            {(isDoctor ? [
              ["/diary", tr("Дневник", "Diary"), BookOpenText],
              ["/settings", tr("Настройки", "Settings"), Settings]
            ] : [
              ["/diary", tr("Дневник", "Diary"), BookOpenText],
              ["/documents", tr("Документы", "Documents"), FileText],
              ["/photos", tr("Фото", "Photos"), Images],
              ["/settings", tr("Настройки", "Settings"), Settings]
            ]).map(([href, label, Icon]) => (
              <a key={href as string} className={"mobile-more-link " + (pathname.startsWith(href as string) ? "active" : "")} href={href as string}>
                <Icon size={20}/><span>{label as string}</span>
              </a>
            ))}
          </div>
        </section>
      </div>}
      <nav className="bottom-nav" aria-label={tr("Мобильная навигация", "Mobile navigation")}>
        {(isDoctor ? [
          ["/doctor", tr("Обзор", "Overview"), LayoutDashboard],
          ["/calendar", tr("История", "History"), CalendarDays],
          ["/documents", tr("Документы", "Documents"), FileText],
          ["/photos", tr("Фото", "Photos"), Images]
        ] : [
          ["/today", tr("Сегодня", "Today"), SunMedium],
          ["/progress", tr("Прогресс", "Progress"), TrendingUp],
          ["/calendar", tr("Календарь", "Calendar"), CalendarDays],
          ["/profile", tr("Профиль", "Profile"), UserRound]
        ]).map(([href, label, Icon]) => (
          <a key={href as string} className={"bottom-link " + (pathname.startsWith(href as string) ? "active" : "")} href={href as string}>
            <Icon size={20}/><span>{label as string}</span>
          </a>
        ))}
        <button
          className={"bottom-link bottom-more-button " + (mobileMoreOpen || mobileMoreActive ? "active" : "")}
          type="button"
          aria-expanded={mobileMoreOpen}
          aria-controls="mobile-more-menu"
          onClick={()=>setMobileMoreOpen((open)=>!open)}
        >
          <MoreHorizontal size={20}/><span>{tr("Ещё", "More")}</span>
        </button>
      </nav>
    </div>
  );
}
