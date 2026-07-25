"use client"

/* ================================================================
   OSGARD · Раздел «Доработки» — конверсионный хаб воронки
   ----------------------------------------------------------------
   Точка после первого БЕСПЛАТНОГО проекта (воронка «1 проект по IP»).
   Классическая воронка: первый проект гость получает без регистрации,
   а ДОРАБОТКИ — за стеной регистрации (регистрация даёт N бесплатных
   доработок, дальше — кредиты/тариф).

   Три состояния (по /api/guest/status):
     • гость с проектом  → стена регистрации + оффер «N бесплатных доработок»;
     • реальный аккаунт  → счётчик доработок и переход к проекту;
     • без проекта       → приглашение создать первый (в hero-форму).

   Счётчик бесплатных доработок и сама механика правок — домен Claude B
   (refinementsRemaining в статусе). Пока он null — показываем нейтральный
   «скоро/перейти к проекту», не выдумывая цифр. Стиль — премиум-словарь
   (.premium-panel/.holo-title/.btn-premium-gold), как в login/register.
   ================================================================ */

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-store"
import { getGuestStatus, type GuestStatus } from "@/lib/guest-session"
import { track } from "@/lib/analytics"

/* Сколько бесплатных доработок обещаем за регистрацию, пока B не подключил
   реальный счётчик. Держим в одном месте, чтобы синхронизировать оффер. */
const FREE_REFINEMENTS_ON_SIGNUP = 3

export function RefinementsView() {
  const router = useRouter()
  const { isAuthenticated } = useAuth()
  const [status, setStatus] = useState<GuestStatus | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    getGuestStatus()
      .then((s) => {
        if (alive) setStatus(s)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [isAuthenticated])

  useEffect(() => {
    if (!loading && status) {
      track("refinements_view", {
        authenticated: status.authenticated,
        isGuest: !!status.isGuest,
        hasProject: !!status.hasProject,
      })
    }
  }, [loading, status])

  const hasProject = !!status?.hasProject
  const projectId = status?.projectId ?? null
  const isGuest = !!status?.isGuest
  const isReal = !!status?.authenticated && !isGuest
  const remaining = status?.refinementsRemaining ?? null

  return (
    <div style={{ minHeight: "100vh", padding: "120px 20px 80px", display: "flex", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: 720 }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div className="elite-eyebrow" style={{ marginBottom: 12 }}>OSGARD · Мастерская</div>
          <h1 className="holo-title" style={{ fontSize: "clamp(2rem, 5vw, 3rem)", margin: 0 }}>
            Доработки
          </h1>
          <p style={{ color: "#8899bb", marginTop: 14, fontSize: "1.02rem", lineHeight: 1.6 }}>
            Первый проект вы создаёте бесплатно. Доработки — итеративная эволюция вашего
            приложения: новые экраны, логика, стиль. Каждая правка делает продукт ближе к идеалу.
          </p>
        </div>

        {loading ? (
          <div className="premium-panel" style={{ padding: 32, textAlign: "center", color: "#8899bb" }}>
            Загрузка состояния…
          </div>
        ) : isReal ? (
          /* -------- Реальный аккаунт -------- */
          <div className="premium-panel" style={{ padding: 32 }}>
            <RefinementBalance remaining={remaining} freeOnSignup={FREE_REFINEMENTS_ON_SIGNUP} />
            {hasProject && projectId ? (
              <button
                className="btn-premium-gold"
                style={{ width: "100%", marginTop: 22 }}
                onClick={() => {
                  track("refinements_open_project", { projectId })
                  router.push(`/projects/${projectId}`)
                }}
              >
                Открыть проект и дорабатывать →
              </button>
            ) : (
              <>
                <p style={{ color: "#8899bb", marginTop: 18, marginBottom: 18 }}>
                  У вас пока нет проекта. Опишите идею на главной — и ИИ соберёт настоящее приложение.
                </p>
                <Link href="/" className="btn-premium-gold" style={{ width: "100%", display: "block", textAlign: "center" }}>
                  Создать первый проект →
                </Link>
              </>
            )}
          </div>
        ) : (
          /* -------- Гость (или аноним) — стена регистрации -------- */
          <div className="premium-panel" style={{ padding: 32 }}>
            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  fontSize: "2.4rem",
                  fontWeight: 700,
                  color: "var(--elite-gold, #f5c451)",
                  lineHeight: 1,
                }}
              >
                +{FREE_REFINEMENTS_ON_SIGNUP}
              </div>
              <div style={{ color: "#8899bb", marginTop: 8, letterSpacing: ".02em" }}>
                бесплатных доработок при регистрации
              </div>
            </div>

            <ul style={{ listStyle: "none", padding: 0, margin: "26px 0 0", display: "grid", gap: 12 }}>
              {[
                hasProject
                  ? "Ваш бесплатный проект сохранится и перейдёт на аккаунт"
                  : "Первый проект — бесплатно, без карты",
                `${FREE_REFINEMENTS_ON_SIGNUP} доработки в подарок сразу после регистрации`,
                "Дальше — доработки за кредиты, по мере роста проекта",
              ].map((line, i) => (
                <li key={i} style={{ display: "flex", gap: 10, color: "#c8d2ea", alignItems: "flex-start" }}>
                  <span style={{ color: "var(--elite-gold, #f5c451)", marginTop: 1 }}>✦</span>
                  <span style={{ lineHeight: 1.5 }}>{line}</span>
                </li>
              ))}
            </ul>

            <Link
              href="/register"
              className="btn-premium-gold"
              style={{ width: "100%", display: "block", textAlign: "center", marginTop: 26 }}
              onClick={() => track("refinements_cta_register", { hasProject })}
            >
              Зарегистрироваться и получить {FREE_REFINEMENTS_ON_SIGNUP} доработки →
            </Link>
            <div style={{ textAlign: "center", marginTop: 14 }}>
              <Link href="/login" style={{ color: "#8899bb", fontSize: ".92rem" }}>
                Уже есть аккаунт? Войти
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* Баланс доработок реального аккаунта. Пока B не подключил счётчик
   (remaining === null) — нейтральная формулировка без выдуманных чисел. */
function RefinementBalance({ remaining, freeOnSignup }: { remaining: number | null; freeOnSignup: number }) {
  if (remaining === null) {
    return (
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: "1.3rem", fontWeight: 600, color: "#e8eefc" }}>
          Доработки подключены к вашему аккаунту
        </div>
        <p style={{ color: "#8899bb", marginTop: 10, lineHeight: 1.6 }}>
          Откройте проект, чтобы продолжить его эволюцию. Первые доработки — бесплатно,
          дальше — за кредиты.
        </p>
      </div>
    )
  }
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: "2.4rem", fontWeight: 700, color: "var(--elite-gold, #f5c451)", lineHeight: 1 }}>
        {remaining}
      </div>
      <div style={{ color: "#8899bb", marginTop: 8 }}>
        {remaining > 0 ? "бесплатных доработок осталось" : "бесплатные доработки использованы"}
      </div>
      {remaining === 0 && (
        <p style={{ color: "#8899bb", marginTop: 12, lineHeight: 1.6 }}>
          Пополните кредиты, чтобы продолжить доработки. Первые {freeOnSignup} были бесплатны.
        </p>
      )}
    </div>
  )
}
