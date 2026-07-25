"use client"

/* ================================================================
   OSGARD · Academy — «Встреча с создателями» (mentor booking)
   ----------------------------------------------------------------
   Финальная фаза Founders Program. Реализует «одну встречу с
   создателями» как КАПИРУЕМУЮ привилегию верхнего тира
   `founder_circle`: не более одного слота в календарный месяц
   (лимит гарантируется на уровне БД — миграция 085).

   Гейт по тиру (без халтуры, честные состояния):
     • гость            → приглашение войти/зарегистрироваться;
     • не founder_circle → апселл на /academy (тир Circle);
     • founder_circle    → форма запроса слота + история сессий.

   Визуальная подпись — та же ДНК, что у academy-view (золото +
   serif Cormorant + собственный язык CTA), но заскоуплена префиксом
   `mnt-`, чтобы не пересекаться с `acd-`/globals. Ноль i18n —
   как во всём вертикале /academy (хардкод русского, единообразно).
   ================================================================ */

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  CalendarHeart,
  Crown,
  Loader2,
  Lock,
  LogIn,
  Check,
  Clock,
  Sparkles,
  Infinity as InfinityIcon,
  ArrowRight,
} from "lucide-react"
import { Navbar } from "./navbar"
import { apiClient } from "@/lib/api-client"
import { useAuth } from "@/lib/auth-store"

/* ─── Формы ответов бэка (backend/src/routes/academy.routes.ts) ─── */
type AcademyTier = "founder_track" | "founder_circle"
type AcademyStatus = {
  enabled: boolean
  enrollment: {
    tier: AcademyTier | null
    status: string
    currentPeriodEnd: number | null
    cancelAtPeriodEnd: boolean
  }
  tierLevel: number
}
type MentorSession = {
  id: number
  tier: string
  status: "requested" | "confirmed" | "completed" | "canceled"
  source: "subscription" | "milestone"
  requestedSlot: string | null
  periodYm: string
  notes: string | null
  confirmedAt: number | null
  completedAt: number | null
  createdAt: number
  updatedAt: number
}
type MentorMy = {
  sessions: MentorSession[]
  periodYm: string
  canRequest: boolean
}

/* Визуальная семантика статусов сессии */
const STATUS_META: Record<
  MentorSession["status"],
  { label: string; cls: string; Icon: typeof Check }
> = {
  requested: { label: "Заявка отправлена", cls: "mnt-badge--req", Icon: Clock },
  confirmed: { label: "Подтверждена", cls: "mnt-badge--ok", Icon: Check },
  completed: { label: "Завершена", cls: "mnt-badge--done", Icon: CalendarHeart },
  canceled: { label: "Отменена", cls: "mnt-badge--cancel", Icon: Lock },
}

function formatMonth(ym: string): string {
  const [y, m] = ym.split("-")
  const months = [
    "январь", "февраль", "март", "апрель", "май", "июнь",
    "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь",
  ]
  const idx = Number(m) - 1
  return `${months[idx] ?? m} ${y}`
}

function formatDate(ms: number): string {
  try {
    return new Date(ms).toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    })
  } catch {
    return "—"
  }
}

export function MentorBookingView() {
  const { user } = useAuth()

  const [status, setStatus] = useState<AcademyStatus | null>(null)
  const [statusFetchDone, setStatusFetchDone] = useState(false)
  const [my, setMy] = useState<MentorMy | null>(null)
  const [myFetchDone, setMyFetchDone] = useState(false)

  const [requestedSlot, setRequestedSlot] = useState("")
  const [notes, setNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null)

  const isCircle =
    (status?.enrollment?.tier === "founder_circle") &&
    (status?.enrollment?.status === "active" || status?.enrollment?.status === "trialing")

  /* «Готово» — производное: гостю грузить статус не нужно, не-Circle не грузит сессии.
     setState только в async-колбэках (без синхронного вызова в теле эффекта). */
  const statusLoaded = !user || statusFetchDone
  const myLoaded = !isCircle || myFetchDone

  /* Статус подписки — только для авторизованных */
  useEffect(() => {
    if (!user) return
    let alive = true
    apiClient
      .get<AcademyStatus>("/academy/status")
      .then((s) => alive && setStatus(s))
      .catch(() => alive && setStatus(null))
      .finally(() => alive && setStatusFetchDone(true))
    return () => {
      alive = false
    }
  }, [user])

  /* Сессии — только когда подтверждён тир Circle */
  useEffect(() => {
    if (!isCircle) return
    let alive = true
    apiClient
      .get<MentorMy>("/academy/mentor/my")
      .then((m) => alive && setMy(m))
      .catch(() => alive && setMy({ sessions: [], periodYm: "", canRequest: true }))
      .finally(() => alive && setMyFetchDone(true))
    return () => {
      alive = false
    }
  }, [isCircle])

  async function handleRequest(e: React.FormEvent) {
    e.preventDefault()
    setNotice(null)
    setSubmitting(true)
    try {
      const res = await apiClient.post<{ session: MentorSession }>("/academy/mentor/request", {
        requestedSlot: requestedSlot.trim() || undefined,
        notes: notes.trim() || undefined,
      })
      // Оптимистично дополняем список и закрываем окно на этот месяц
      setMy((prev) => ({
        sessions: [res.session, ...(prev?.sessions ?? [])],
        periodYm: res.session.periodYm,
        canRequest: false,
      }))
      setRequestedSlot("")
      setNotes("")
      setNotice({ kind: "ok", text: "Заявка отправлена. Команда подтвердит слот и свяжется с вами." })
    } catch (err: any) {
      // Бэк отдаёт человекочитаемый русский текст в err.data.error (403/409/500).
      const msg =
        err?.data?.error ||
        err?.data?.message ||
        (err?.status === 403 ? "Встреча доступна только на тире Founder Circle." : null) ||
        err?.message ||
        "Не удалось отправить заявку. Попробуйте позже."
      setNotice({ kind: "err", text: msg })
      // Слот уже занят в этом месяце — синхронизируем UI под реальное состояние
      if (err?.data?.code === "MENTOR_SLOT_TAKEN") {
        setMy((prev) =>
          prev ? { ...prev, canRequest: false } : { sessions: [], periodYm: "", canRequest: false },
        )
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mnt-root">
      <Navbar />
      <AuraBackdrop />

      <main className="mnt-main">
        <header className="mnt-hero">
          <span className="mnt-eyebrow">
            <InfinityIcon size={14} strokeWidth={2.5} />
            OSGARD · FOUNDER CIRCLE
          </span>
          <h1 className="mnt-title">
            Встреча с <span className="mnt-title-accent">создателями</span>
          </h1>
          <p className="mnt-lede">
            Личный час с командой, построившей платформу. Живой разбор именно вашего стартапа —
            один слот в месяц, привилегия тира <span className="mnt-lede-strong">Founder Circle</span>.
          </p>
        </header>

        {/* ─── Состояния гейта ─── */}
        {!statusLoaded ? (
          <div className="mnt-loading">
            <Loader2 size={20} className="mnt-spin" /> Загружаем ваш статус…
          </div>
        ) : !user ? (
          <GateCard
            Icon={LogIn}
            title="Войдите, чтобы записаться"
            text="Встреча с создателями — привилегия участников программы Founders. Войдите или создайте аккаунт, чтобы продолжить."
            primary={{ href: "/register?next=/calendar", label: "Создать аккаунт" }}
            secondary={{ href: "/login?next=/calendar", label: "Войти" }}
          />
        ) : !isCircle ? (
          <GateCard
            Icon={Crown}
            title="Доступно на тире Founder Circle"
            text="Слот встречи с создателями входит во флагманский тир Founder Circle ($990/мес). Оформите Circle в Академии основателей — и запрашивайте личный разбор каждый месяц."
            primary={{ href: "/academy", label: "Открыть Академию" }}
          />
        ) : (
          <section className="mnt-panel">
            {/* Форма запроса слота */}
            <div className="mnt-request">
              <div className="mnt-request-head">
                <div className="mnt-request-ico">
                  <CalendarHeart size={22} strokeWidth={1.6} />
                </div>
                <div>
                  <h2 className="mnt-request-title">Запросить слот</h2>
                  <p className="mnt-request-sub">
                    {my ? formatMonth(my.periodYm) : "текущий месяц"} · один слот на месяц
                  </p>
                </div>
              </div>

              {my && !my.canRequest ? (
                <div className="mnt-closed">
                  <Check size={16} strokeWidth={3} />
                  Слот на этот месяц уже запрошен. Новый можно оформить в следующем месяце —
                  создатели успевают уделить каждому полноценное время.
                </div>
              ) : (
                <form className="mnt-form" onSubmit={handleRequest}>
                  <label className="mnt-field">
                    <span className="mnt-label">Удобное время (необязательно)</span>
                    <input
                      type="text"
                      className="mnt-input"
                      placeholder="Напр.: будни после 18:00 МСК, или конкретная дата"
                      value={requestedSlot}
                      onChange={(e) => setRequestedSlot(e.target.value)}
                      maxLength={200}
                    />
                  </label>
                  <label className="mnt-field">
                    <span className="mnt-label">О чём хотите поговорить</span>
                    <textarea
                      className="mnt-input mnt-textarea"
                      placeholder="Коротко о вашем стартапе и главном вопросе к создателям"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      maxLength={1000}
                      rows={4}
                    />
                  </label>

                  <button type="submit" className="mnt-cta" disabled={submitting}>
                    <span className="mnt-cta-label">
                      {submitting ? (
                        <Loader2 size={16} className="mnt-spin" />
                      ) : (
                        <>
                          <Sparkles size={16} /> Отправить заявку
                        </>
                      )}
                    </span>
                    <InfinityIcon className="mnt-cta-inf" size={18} strokeWidth={2} />
                  </button>
                </form>
              )}

              {notice && (
                <div className={`mnt-notice mnt-notice--${notice.kind}`}>{notice.text}</div>
              )}
            </div>

            {/* История сессий */}
            <div className="mnt-history">
              <h3 className="mnt-history-title">Ваши встречи</h3>

              {!myLoaded ? (
                <div className="mnt-loading mnt-loading--sm">
                  <Loader2 size={18} className="mnt-spin" /> Загружаем…
                </div>
              ) : !my || my.sessions.length === 0 ? (
                <div className="mnt-empty">
                  Пока нет ни одной заявки. Запросите первый слот — и он появится здесь со статусом.
                </div>
              ) : (
                <ul className="mnt-list">
                  {my.sessions.map((s) => {
                    const meta = STATUS_META[s.status]
                    return (
                      <li key={s.id} className="mnt-item">
                        <div className="mnt-item-top">
                          <span className="mnt-item-month">{formatMonth(s.periodYm)}</span>
                          <span className={`mnt-badge ${meta.cls}`}>
                            <meta.Icon size={12} strokeWidth={2.5} />
                            {meta.label}
                          </span>
                        </div>
                        {s.source === "milestone" && (
                          <span className="mnt-gift">
                            <Sparkles size={12} /> Подарочный слот за веху
                          </span>
                        )}
                        {s.requestedSlot && (
                          <div className="mnt-item-row">
                            <span className="mnt-item-key">Время:</span> {s.requestedSlot}
                          </div>
                        )}
                        {s.notes && (
                          <div className="mnt-item-row mnt-item-notes">{s.notes}</div>
                        )}
                        <div className="mnt-item-meta">
                          Заявка от {formatDate(s.createdAt)}
                          {s.confirmedAt ? ` · подтверждена ${formatDate(s.confirmedAt)}` : ""}
                          {s.completedAt ? ` · проведена ${formatDate(s.completedAt)}` : ""}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </section>
        )}
      </main>

      <style>{MENTOR_CSS}</style>
    </div>
  )
}

/* ─── Универсальная карточка-гейт (гость / не-Circle) ─── */
function GateCard({
  Icon,
  title,
  text,
  primary,
  secondary,
}: {
  Icon: typeof Crown
  title: string
  text: string
  primary: { href: string; label: string }
  secondary?: { href: string; label: string }
}) {
  return (
    <div className="mnt-gate">
      <div className="mnt-gate-ico">
        <Icon size={28} strokeWidth={1.5} />
      </div>
      <h2 className="mnt-gate-title">{title}</h2>
      <p className="mnt-gate-text">{text}</p>
      <div className="mnt-gate-actions">
        <Link href={primary.href} className="mnt-cta mnt-cta--inline">
          <span className="mnt-cta-label">
            {primary.label} <ArrowRight size={16} />
          </span>
          <InfinityIcon className="mnt-cta-inf" size={18} strokeWidth={2} />
        </Link>
        {secondary && (
          <Link href={secondary.href} className="mnt-ghost">
            {secondary.label}
          </Link>
        )}
      </div>
    </div>
  )
}

/* ─── Амбиентный золотой фон (лёгкий, декоративный) ─── */
function AuraBackdrop() {
  return (
    <div className="mnt-aura" aria-hidden="true">
      <span className="mnt-aura-a" />
      <span className="mnt-aura-b" />
    </div>
  )
}

const MENTOR_CSS = `
.mnt-root {
  position: relative; min-height: 100vh;
  background:
    radial-gradient(1100px 560px at 50% -8%, rgba(212,175,55,0.10), transparent 60%),
    radial-gradient(800px 460px at 50% 108%, rgba(212,175,55,0.05), transparent 60%),
    #070B18;
  color: #EFE9DA; overflow: hidden;
}
.mnt-main { position: relative; z-index: 2; max-width: 980px; margin: 0 auto; padding: 72px 24px 120px; }

/* Фон */
.mnt-aura { position: absolute; inset: 0; z-index: 1; pointer-events: none; overflow: hidden; }
.mnt-aura-a, .mnt-aura-b {
  position: absolute; border-radius: 50%; filter: blur(80px); opacity: 0.5;
}
.mnt-aura-a { width: 520px; height: 520px; top: -120px; left: -80px;
  background: radial-gradient(circle, rgba(212,175,55,0.22), transparent 70%); }
.mnt-aura-b { width: 460px; height: 460px; bottom: -140px; right: -100px;
  background: radial-gradient(circle, rgba(212,175,55,0.14), transparent 70%); }

/* Hero */
.mnt-hero { text-align: center; max-width: 720px; margin: 0 auto 52px; }
.mnt-eyebrow {
  display: inline-flex; align-items: center; gap: 8px;
  font-size: 12px; font-weight: 700; letter-spacing: 3px; text-transform: uppercase;
  color: #D4AF37; padding: 7px 16px; border-radius: 999px;
  border: 1px solid rgba(212,175,55,0.35); background: rgba(212,175,55,0.06);
}
.mnt-title {
  font-family: var(--font-cormorant, 'Cormorant Garamond', Georgia, serif);
  font-size: clamp(40px, 6.5vw, 68px); line-height: 1.03; font-weight: 600;
  margin: 22px 0 0; letter-spacing: 0.5px; color: #F6F1E4;
}
.mnt-title-accent {
  background: linear-gradient(100deg, #F4D77E, #D4AF37 55%, #B8860B);
  -webkit-background-clip: text; background-clip: text; color: transparent; font-style: italic;
}
.mnt-lede { margin: 20px auto 0; max-width: 600px; font-size: 17px; line-height: 1.6; color: #C7C0AE; }
.mnt-lede-strong { color: #EAD79A; font-weight: 600; }

/* Гейт-карта */
.mnt-gate {
  max-width: 560px; margin: 0 auto; text-align: center;
  padding: 44px 34px; border-radius: 22px;
  background: linear-gradient(180deg, rgba(20,26,46,0.9), rgba(12,16,30,0.9));
  border: 1px solid rgba(212,175,55,0.28);
  box-shadow: 0 20px 56px rgba(7,11,24,0.55);
}
.mnt-gate-ico {
  width: 64px; height: 64px; border-radius: 18px; margin: 0 auto 20px;
  display: grid; place-items: center; color: #D4AF37;
  background: rgba(212,175,55,0.10); border: 1px solid rgba(212,175,55,0.3);
}
.mnt-gate-title { font-size: 24px; font-weight: 800; margin: 0 0 12px; color: #F4EEDC; }
.mnt-gate-text { font-size: 15px; line-height: 1.6; color: #ABA491; margin: 0 0 26px; }
.mnt-gate-actions { display: flex; align-items: center; justify-content: center; gap: 14px; flex-wrap: wrap; }

/* Панель Circle */
.mnt-panel { display: grid; grid-template-columns: 1fr 1fr; gap: 26px; align-items: start; }
.mnt-request, .mnt-history {
  padding: 30px 28px; border-radius: 20px;
  background: rgba(18,24,42,0.72); border: 1px solid rgba(212,175,55,0.18);
  backdrop-filter: blur(8px);
}
.mnt-request-head { display: flex; align-items: center; gap: 14px; margin-bottom: 22px; }
.mnt-request-ico {
  width: 50px; height: 50px; border-radius: 14px; flex-shrink: 0;
  display: grid; place-items: center; color: #D4AF37;
  background: rgba(212,175,55,0.10); border: 1px solid rgba(212,175,55,0.3);
}
.mnt-request-title { font-size: 19px; font-weight: 800; margin: 0; color: #F4EEDC; }
.mnt-request-sub { font-size: 13px; color: #9C9585; margin: 3px 0 0; }

.mnt-form { display: grid; gap: 16px; }
.mnt-field { display: grid; gap: 7px; }
.mnt-label { font-size: 13px; font-weight: 600; color: #C7C0AE; }
.mnt-input {
  width: 100%; box-sizing: border-box;
  background: rgba(8,12,24,0.7); color: #EFE9DA;
  border: 1px solid rgba(212,175,55,0.22); border-radius: 12px;
  padding: 12px 14px; font-size: 14.5px; font-family: inherit;
  transition: border-color .2s ease, box-shadow .2s ease;
}
.mnt-input::placeholder { color: #6E6858; }
.mnt-input:focus { outline: none; border-color: rgba(212,175,55,0.6); box-shadow: 0 0 0 3px rgba(212,175,55,0.12); }
.mnt-textarea { resize: vertical; min-height: 96px; line-height: 1.5; }

.mnt-closed, .mnt-empty {
  font-size: 14px; line-height: 1.6; color: #ABA491;
  padding: 16px 18px; border-radius: 12px;
  background: rgba(212,175,55,0.06); border: 1px solid rgba(212,175,55,0.2);
}
.mnt-closed { display: flex; gap: 10px; align-items: flex-start; color: #EAD79A; }
.mnt-closed svg { flex-shrink: 0; margin-top: 2px; }

/* CTA — собственный язык (золото + свип + ∞), как в academy */
.mnt-cta {
  position: relative; overflow: hidden;
  display: inline-flex; align-items: center; justify-content: center;
  height: 52px; padding: 0 26px; border-radius: 14px; cursor: pointer;
  font-size: 14.5px; font-weight: 800; letter-spacing: 1.1px; text-transform: uppercase;
  border: 1px solid transparent; text-decoration: none;
  color: #1A1405; background: linear-gradient(100deg, #F4D77E, #D4AF37 55%, #C79A24);
  box-shadow: 0 10px 30px rgba(212,175,55,0.26), inset 0 1px 0 rgba(255,255,255,0.4);
  transition: transform .25s cubic-bezier(0.16,1,0.3,1), box-shadow .25s ease;
}
.mnt-cta--inline { height: 50px; }
.mnt-cta:disabled { cursor: default; opacity: 0.7; }
.mnt-cta-label { position: relative; z-index: 2; display: inline-flex; align-items: center; gap: 8px; }
.mnt-cta-inf {
  position: absolute; z-index: 1; right: 16px; opacity: 0; color: currentColor;
  transform: translateX(8px) scale(0.6);
  transition: opacity .3s ease, transform .3s cubic-bezier(0.16,1,0.3,1);
}
.mnt-cta::after {
  content: ""; position: absolute; inset: 0; z-index: 0;
  background: linear-gradient(100deg, transparent 20%, rgba(255,255,255,0.35) 50%, transparent 80%);
  transform: translateX(-120%); transition: transform .6s cubic-bezier(0.16,1,0.3,1);
}
.mnt-cta:hover:not(:disabled) { transform: scale(1.03); box-shadow: 0 14px 40px rgba(212,175,55,0.4), inset 0 1px 0 rgba(255,255,255,0.5); }
.mnt-cta:hover:not(:disabled)::after { transform: translateX(120%); }
.mnt-cta:hover:not(:disabled) .mnt-cta-inf { opacity: 0.85; transform: translateX(0) scale(1); }

.mnt-ghost {
  display: inline-flex; align-items: center; height: 50px; padding: 0 22px;
  border-radius: 14px; text-decoration: none;
  color: #EAD79A; background: rgba(212,175,55,0.06);
  border: 1px solid rgba(212,175,55,0.4);
  font-size: 14px; font-weight: 700; letter-spacing: 0.5px;
  transition: background .2s ease;
}
.mnt-ghost:hover { background: rgba(212,175,55,0.12); }

/* Уведомления */
.mnt-notice { margin-top: 18px; padding: 12px 16px; border-radius: 12px; font-size: 14px; line-height: 1.5; }
.mnt-notice--ok { color: #7CF0B0; background: rgba(46,204,113,0.08); border: 1px solid rgba(46,204,113,0.3); }
.mnt-notice--err { color: #F0A7A7; background: rgba(231,76,60,0.08); border: 1px solid rgba(231,76,60,0.32); }

/* История */
.mnt-history-title { font-size: 17px; font-weight: 800; margin: 0 0 18px; color: #F0EAD9; }
.mnt-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 14px; }
.mnt-item {
  padding: 16px 18px; border-radius: 14px;
  background: rgba(10,14,28,0.6); border: 1px solid rgba(212,175,55,0.14);
}
.mnt-item-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 8px; }
.mnt-item-month { font-size: 14px; font-weight: 700; color: #EAD79A; text-transform: capitalize; }
.mnt-badge {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 11.5px; font-weight: 700; letter-spacing: 0.3px;
  padding: 4px 10px; border-radius: 999px; white-space: nowrap;
}
.mnt-badge--req { color: #EAD79A; background: rgba(212,175,55,0.10); border: 1px solid rgba(212,175,55,0.32); }
.mnt-badge--ok { color: #7CF0B0; background: rgba(46,204,113,0.10); border: 1px solid rgba(46,204,113,0.35); }
.mnt-badge--done { color: #9BC7FF; background: rgba(90,150,255,0.10); border: 1px solid rgba(90,150,255,0.32); }
.mnt-badge--cancel { color: #B7AFA0; background: rgba(140,130,110,0.10); border: 1px solid rgba(140,130,110,0.3); }
.mnt-gift {
  display: inline-flex; align-items: center; gap: 5px; margin-bottom: 8px;
  font-size: 12px; font-weight: 600; color: #F4D77E;
}
.mnt-item-row { font-size: 13.5px; line-height: 1.5; color: #C7C0AE; margin-top: 4px; }
.mnt-item-key { color: #9C9585; }
.mnt-item-notes { color: #ABA491; font-style: italic; }
.mnt-item-meta { font-size: 12px; color: #7E7869; margin-top: 8px; }

/* Загрузка / spin */
.mnt-loading { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 40px; color: #ABA491; font-size: 15px; }
.mnt-loading--sm { padding: 20px; font-size: 14px; }
.mnt-spin { animation: mnt-rot 0.9s linear infinite; }
@keyframes mnt-rot { to { transform: rotate(360deg); } }

/* Адаптив */
@media (max-width: 820px) {
  .mnt-panel { grid-template-columns: 1fr; }
}
@media (prefers-reduced-motion: reduce) {
  .mnt-cta, .mnt-cta::after, .mnt-cta-inf, .mnt-spin { animation: none !important; transition: none !important; }
}
`
