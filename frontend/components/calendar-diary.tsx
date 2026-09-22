"use client";

import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, Pencil, Plus, Send, Trash2, X } from "lucide-react";
import { api } from "@/lib/api";
import { useLanguage } from "@/lib/i18n";

type Comment = {
  id: string;
  entry_id: string;
  body: string;
  author_name: string;
  author_role: string;
  is_mine: boolean;
  created_at: string;
};

type Entry = {
  id: string;
  occurred_at: string;
  title: string | null;
  body: string;
  category: string;
  severity: number | null;
  comments: Comment[];
};

type SessionPayload = { user: { role: string } };
type Translate = (ru: string, en: string) => string;

const categories = ["lips", "skin", "eyes", "nose", "general wellbeing", "other"];

function localDateTimeValue(value: string) {
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CalendarDiary({ date }: { date: string }) {
  const qc = useQueryClient();
  const { tr, dateLocale } = useLanguage();
  const [open, setOpen] = useState(false);
  const [occurredAt, setOccurredAt] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("general wellbeing");
  const [severity, setSeverity] = useState("");

  const me = useQuery({ queryKey: ["me"], queryFn: () => api<SessionPayload>("/api/auth/me") });
  const canEditEntry = !!me.data?.user.role && me.data.user.role !== "DOCTOR";
  const query = useQuery({
    queryKey: ["calendar-diary", date],
    queryFn: () => api<Entry[]>(`/api/diary?date=${encodeURIComponent(date)}`),
  });

  useEffect(() => {
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, "0");
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const clock = date === today ? `${pad(now.getHours())}:${pad(now.getMinutes())}` : "12:00";
    setOccurredAt(`${date}T${clock}`);
    setOpen(false);
  }, [date]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["calendar-diary", date] });
    qc.invalidateQueries({ queryKey: ["diary"] });
  };

  const categoryLabel = (value: string) =>
    ({
      lips: tr("Губы", "Lips"),
      skin: tr("Кожа", "Skin"),
      eyes: tr("Глаза", "Eyes"),
      nose: tr("Нос", "Nose"),
      "general wellbeing": tr("Общее самочувствие", "General wellbeing"),
      other: tr("Другое", "Other"),
    })[value] ?? value;

  const create = useMutation({
    mutationFn: () =>
      api<Entry>("/api/diary", {
        method: "POST",
        body: JSON.stringify({
          occurred_at: new Date(occurredAt).toISOString(),
          title: title.trim() || null,
          body: body.trim(),
          category,
          severity: severity ? Number(severity) : null,
        }),
      }),
    onSuccess: () => {
      setOpen(false);
      setTitle("");
      setBody("");
      setCategory("general wellbeing");
      setSeverity("");
      refresh();
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (occurredAt && body.trim()) create.mutate();
  }

  return (
    <div className="stack calendar-diary" style={{ gap: 14 }}>
      <div className="row between responsive-between">
        <div>
          <h3 style={{ margin: 0 }}>{tr("Заметки дневника", "Diary notes")}</h3>
          <div className="muted small" style={{ marginTop: 4 }}>
            {tr("Заметки и комментарии за выбранный день", "Notes and comments for the selected day")}
          </div>
        </div>
        {canEditEntry && (
          <button className="btn secondary" onClick={() => setOpen((value) => !value)}>
            <Plus size={16} />
            {tr("Добавить заметку", "Add note")}
          </button>
        )}
      </div>

      {open && canEditEntry && (
        <form className="diary-calendar-form stack" onSubmit={submit}>
          <h3 style={{ margin: 0, fontSize: 17 }}>{tr("Новая заметка", "New note")}</h3>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="calendar-diary-datetime">{tr("Дата и время", "Date and time")}</label>
              <input id="calendar-diary-datetime" className="input" type="datetime-local" value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="calendar-diary-title">{tr("Название", "Title")}</label>
              <input id="calendar-diary-title" className="input" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} />
            </div>
            <div className="field">
              <label htmlFor="calendar-diary-category">{tr("Категория", "Category")}</label>
              <select id="calendar-diary-category" className="select" value={category} onChange={(event) => setCategory(event.target.value)}>
                {categories.map((item) => (
                  <option key={item} value={item}>{categoryLabel(item)}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="calendar-diary-severity">{tr("Выраженность", "Severity")}</label>
              <select id="calendar-diary-severity" className="select" value={severity} onChange={(event) => setSeverity(event.target.value)}>
                <option value="">{tr("Не указано", "Not set")}</option>
                {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="calendar-diary-body">{tr("Что вы заметили?", "What did you notice?")}</label>
            <textarea id="calendar-diary-body" className="textarea" value={body} onChange={(event) => setBody(event.target.value)} required maxLength={20000} />
          </div>
          {create.error && <div className="error">{create.error.message}</div>}
          <div className="form-actions">
            <button type="button" className="btn secondary" onClick={() => setOpen(false)}>{tr("Отмена", "Cancel")}</button>
            <button className="btn" disabled={create.isPending || !occurredAt || !body.trim()}>
              {create.isPending ? tr("Сохранение…", "Saving…") : tr("Сохранить заметку", "Save note")}
            </button>
          </div>
        </form>
      )}

      {query.isLoading && <div className="skeleton" style={{ height: 110 }} />}
      {query.error && <div className="error">{query.error.message}</div>}
      {!query.isLoading && query.data?.length === 0 && <div className="muted">{tr("На эту дату заметок нет.", "No diary notes for this date.")}</div>}
      <div className="stack">
        {query.data?.map((entry) => (
          <CalendarDiaryEntry key={entry.id} entry={entry} canEditEntry={canEditEntry} dateLocale={dateLocale} tr={tr} categoryLabel={categoryLabel} onChanged={refresh} />
        ))}
      </div>
    </div>
  );
}

function CalendarDiaryEntry({ entry, canEditEntry, dateLocale, tr, categoryLabel, onChanged }: {
  entry: Entry;
  canEditEntry: boolean;
  dateLocale: string;
  tr: Translate;
  categoryLabel: (value: string) => string;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [occurredAt, setOccurredAt] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState(entry.category);
  const [severity, setSeverity] = useState("");

  const beginEdit = () => {
    setOccurredAt(localDateTimeValue(entry.occurred_at));
    setTitle(entry.title ?? "");
    setBody(entry.body);
    setCategory(entry.category);
    setSeverity(entry.severity ? String(entry.severity) : "");
    setEditing(true);
  };

  const edit = useMutation({
    mutationFn: () =>
      api<Entry>(`/api/diary/${entry.id}`, {
        method: "PUT",
        body: JSON.stringify({
          occurred_at: new Date(occurredAt).toISOString(),
          title: title.trim() || null,
          body: body.trim(),
          category,
          severity: severity ? Number(severity) : null,
        }),
      }),
    onSuccess: () => {
      setEditing(false);
      onChanged();
    },
  });

  const remove = useMutation({
    mutationFn: () => api(`/api/diary/${entry.id}`, { method: "DELETE" }),
    onSuccess: onChanged,
  });

  return (
    <article className="card diary-card calendar-diary-card">
      <div className="diary-entry-content">
        {!editing ? (
          <>
            <div className="row between diary-entry-head">
              <div>
                <h3 style={{ fontSize: 17, margin: 0 }}>{entry.title || categoryLabel(entry.category)}</h3>
                <div className="muted small" style={{ marginTop: 5 }}>
                  {new Date(entry.occurred_at).toLocaleString(dateLocale)} · {categoryLabel(entry.category)}
                  {entry.severity ? ` · ${tr("выраженность", "severity")} ${entry.severity}/5` : ""}
                </div>
              </div>
              {canEditEntry && (
                <div className="row">
                  <button type="button" className="btn secondary icon-btn" aria-label={tr("Редактировать запись", "Edit entry")} onClick={beginEdit}><Pencil size={16} /></button>
                  <button type="button" className="btn danger icon-btn" aria-label={tr("Удалить запись", "Delete entry")} onClick={() => {
                    if (confirm(tr("Удалить эту запись дневника?", "Delete this diary entry?"))) remove.mutate();
                  }}><Trash2 size={16} /></button>
                </div>
              )}
            </div>
            <p style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}>{entry.body}</p>
          </>
        ) : canEditEntry ? (
          <form className="stack" onSubmit={(event) => { event.preventDefault(); if (occurredAt && body.trim()) edit.mutate(); }}>
            <h3 style={{ fontSize: 17, margin: 0 }}>{tr("Редактировать запись", "Edit entry")}</h3>
            <div className="form-grid">
              <div className="field">
                <label htmlFor={`calendar-edit-date-${entry.id}`}>{tr("Дата и время", "Date and time")}</label>
                <input id={`calendar-edit-date-${entry.id}`} className="input" type="datetime-local" value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} required />
              </div>
              <div className="field">
                <label htmlFor={`calendar-edit-title-${entry.id}`}>{tr("Название", "Title")}</label>
                <input id={`calendar-edit-title-${entry.id}`} className="input" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} />
              </div>
              <div className="field">
                <label htmlFor={`calendar-edit-category-${entry.id}`}>{tr("Категория", "Category")}</label>
                <select id={`calendar-edit-category-${entry.id}`} className="select" value={category} onChange={(event) => setCategory(event.target.value)}>
                  {categories.map((item) => <option key={item} value={item}>{categoryLabel(item)}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor={`calendar-edit-severity-${entry.id}`}>{tr("Выраженность", "Severity")}</label>
                <select id={`calendar-edit-severity-${entry.id}`} className="select" value={severity} onChange={(event) => setSeverity(event.target.value)}>
                  <option value="">{tr("Не указано", "Not set")}</option>
                  {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </div>
            </div>
            <div className="field">
              <label htmlFor={`calendar-edit-body-${entry.id}`}>{tr("Что вы заметили?", "What did you notice?")}</label>
              <textarea id={`calendar-edit-body-${entry.id}`} className="textarea" value={body} onChange={(event) => setBody(event.target.value)} required maxLength={20000} />
            </div>
            {edit.error && <div className="error">{edit.error.message}</div>}
            <div className="form-actions">
              <button type="button" className="btn secondary" onClick={() => setEditing(false)}>{tr("Отмена", "Cancel")}</button>
              <button className="btn" disabled={edit.isPending || !occurredAt || !body.trim()}>
                {edit.isPending ? tr("Сохранение…", "Saving…") : tr("Сохранить изменения", "Save changes")}
              </button>
            </div>
          </form>
        ) : null}
      </div>
      <CalendarCommentThread entry={entry} dateLocale={dateLocale} tr={tr} onChanged={onChanged} />
    </article>
  );
}

function CalendarCommentThread({ entry, dateLocale, tr, onChanged }: {
  entry: Entry;
  dateLocale: string;
  tr: Translate;
  onChanged: () => void;
}) {
  const [text, setText] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const create = useMutation({
    mutationFn: () => api<Comment>(`/api/diary/${entry.id}/comments`, { method: "POST", body: JSON.stringify({ body: text.trim() }) }),
    onSuccess: () => { setText(""); onChanged(); },
  });
  const edit = useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) => api<Comment>(`/api/diary/comments/${id}`, { method: "PUT", body: JSON.stringify({ body }) }),
    onSuccess: () => { setEditing(null); setEditText(""); onChanged(); },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/diary/comments/${id}`, { method: "DELETE" }),
    onSuccess: onChanged,
  });

  const roleLabel = (comment: Comment) => comment.is_mine ? tr("Вы", "You") : comment.author_role === "DOCTOR" ? tr("Врач", "Doctor") : tr("Пациент", "Patient");

  return (
    <div className="diary-comments">
      <div className="diary-comments-title"><MessageCircle size={16} /><strong>{tr("Комментарии", "Comments")}</strong><span>{entry.comments?.length ?? 0}</span></div>
      <div className="comment-list">
        {entry.comments?.map((comment) => (
          <div className={`comment-bubble ${comment.author_role === "DOCTOR" ? "doctor" : "patient"}`} key={comment.id}>
            <div className="comment-meta">
              <div><strong>{roleLabel(comment)}</strong>{!comment.is_mine && comment.author_name ? <span> · {comment.author_name}</span> : null}</div>
              <span>{new Date(comment.created_at).toLocaleString(dateLocale)}</span>
            </div>
            {editing === comment.id ? (
              <div className="comment-edit">
                <textarea className="textarea" value={editText} onChange={(event) => setEditText(event.target.value)} maxLength={5000} />
                {edit.error && <div className="error">{edit.error.message}</div>}
                <div className="row">
                  <button type="button" className="btn compact-btn" disabled={!editText.trim() || edit.isPending} onClick={() => edit.mutate({ id: comment.id, body: editText.trim() })}>{tr("Сохранить", "Save")}</button>
                  <button type="button" className="btn secondary icon-btn" onClick={() => { setEditing(null); setEditText(""); }} aria-label={tr("Отмена", "Cancel")}><X size={15} /></button>
                </div>
              </div>
            ) : (
              <p>{comment.body}</p>
            )}
            {comment.is_mine && editing !== comment.id && (
              <div className="comment-actions">
                <button className="icon-plain" type="button" onClick={() => { setEditing(comment.id); setEditText(comment.body); }} aria-label={tr("Редактировать комментарий", "Edit comment")}><Pencil size={14} /></button>
                <button className="icon-plain danger-text" type="button" onClick={() => {
                  if (confirm(tr("Удалить комментарий?", "Delete comment?"))) remove.mutate(comment.id);
                }} aria-label={tr("Удалить комментарий", "Delete comment")}><Trash2 size={14} /></button>
              </div>
            )}
          </div>
        ))}
      </div>
      <form className="comment-compose" onSubmit={(event) => { event.preventDefault(); if (text.trim()) create.mutate(); }}>
        <textarea className="textarea" value={text} onChange={(event) => setText(event.target.value)} placeholder={tr("Добавить комментарий…", "Add a comment…")} maxLength={5000} />
        <button className="btn icon-btn" disabled={!text.trim() || create.isPending} aria-label={tr("Отправить комментарий", "Send comment")}><Send size={16} /></button>
      </form>
      {create.error && <div className="error">{create.error.message}</div>}
    </div>
  );
}
