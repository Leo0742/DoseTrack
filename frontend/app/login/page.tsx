"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, LockKeyhole } from "lucide-react";
import { api } from "@/lib/api";
import { useLanguage } from "@/lib/i18n";

type LoginResponse = {
  user: { id: string; username: string; role: string };
  csrf_token: string;
};

export default function LoginPage() {
  const router = useRouter();
  const { tr, locale } = useLanguage();
  const [identity, setIdentity] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await api<LoginResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ identity, password })
      });
      sessionStorage.setItem("dosetrack_csrf", result.csrf_token);
      router.replace(result.user.role === "DOCTOR" ? "/doctor" : "/today");
      router.refresh();
    } catch (err) {
      setError(locale === "ru" ? "Не удалось войти. Проверьте логин и пароль." : err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{minHeight:"100vh", display:"grid", placeItems:"center", padding:20}}>
      <section className="card section" style={{width:"min(420px,100%)", boxShadow:"var(--shadow)"}}>
        <div className="brand" style={{padding:"0 0 24px"}}>
          <span className="brand-mark"><Activity size={18}/></span>
          DoseTrack
        </div>
        <div style={{marginBottom:24}}>
          <h1 style={{fontSize:28}}>{tr("С возвращением", "Welcome back")}</h1>
          <p className="muted" style={{marginBottom:0}}>{tr("Личная история лечения доступна только авторизованным пользователям.", "Private treatment history, available only to authorized accounts.")}</p>
        </div>
        <form className="stack" onSubmit={submit}>
          <div className="field">
            <label htmlFor="identity">{tr("Email или логин", "Email or username")}</label>
            <input className="input" id="identity" autoComplete="username" value={identity} onChange={e=>setIdentity(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="password">{tr("Пароль", "Password")}</label>
            <input className="input" id="password" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required />
          </div>
          {error && <div className="error" role="alert">{error}</div>}
          <button className="btn" disabled={loading} style={{width:"100%"}}>
            <LockKeyhole size={17} style={{verticalAlign:"-3px", marginRight:8}}/>
            {loading ? tr("Вход…", "Signing in…") : tr("Войти", "Sign in")}
          </button>
        </form>
      </section>
    </main>
  );
}
