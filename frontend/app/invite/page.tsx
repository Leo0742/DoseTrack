"use client";

import { FormEvent, useEffect, useState } from "react";
import { Activity, Stethoscope } from "lucide-react";
import { api } from "@/lib/api";
import { useLanguage } from "@/lib/i18n";

export default function InvitePage() {
  const { tr, locale } = useLanguage();
  const [token, setToken] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const supplied = new URLSearchParams(window.location.search).get("token");
    if (supplied) setToken(supplied);
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api("/api/doctor/invites/accept", {
        method: "POST",
        body: JSON.stringify({ token, username, password })
      });
      setDone(true);
    } catch (err) {
      setError(locale === "ru" ? "Не удалось принять приглашение." : err instanceof Error ? err.message : "Invite could not be accepted");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{minHeight:"100vh",display:"grid",placeItems:"center",padding:20}}>
      <section className="card section" style={{width:"min(460px,100%)",boxShadow:"var(--shadow)"}}>
        <div className="brand" style={{padding:"0 0 22px"}}>
          <span className="brand-mark"><Activity size={18}/></span>DoseTrack
        </div>
        <div className="row" style={{marginBottom:10}}><Stethoscope size={20}/><h1 style={{fontSize:27}}>{tr("Доступ для врача", "Doctor access")}</h1></div>
        {done ? (
          <div className="stack">
            <div className="notice">{tr("Приглашение принято. Аккаунт врача имеет доступ к истории пациента только для чтения.", "Access was accepted. Your account is read-only for the patient treatment record.")}</div>
            <a className="btn" href="/login" style={{display:"grid",placeItems:"center"}}>{tr("Войти", "Sign in")}</a>
          </div>
        ) : (
          <form className="stack" onSubmit={submit}>
            <p className="muted" style={{marginTop:0}}>{tr("Введите одноразовый токен от пациента и создайте данные для входа врача.", "Enter the one-time token shared by the patient and create your doctor login.")}</p>
            <div className="field"><label htmlFor="invite-token">{tr("Токен приглашения", "Invite token")}</label><input id="invite-token" className="input" value={token} onChange={e=>setToken(e.target.value)} required autoComplete="off"/></div>
            <div className="field"><label htmlFor="doctor-username">{tr("Логин", "Username")}</label><input id="doctor-username" className="input" value={username} onChange={e=>setUsername(e.target.value)} required minLength={2} autoComplete="username"/></div>
            <div className="field"><label htmlFor="doctor-password">{tr("Пароль", "Password")}</label><input id="doctor-password" className="input" type="password" value={password} onChange={e=>setPassword(e.target.value)} required minLength={10} autoComplete="new-password"/></div>
            {error&&<div className="error" role="alert">{error}</div>}
            <button className="btn" disabled={loading}>{loading?tr("Принятие…", "Accepting…"):tr("Принять приглашение", "Accept invite")}</button>
          </form>
        )}
      </section>
    </main>
  );
}
