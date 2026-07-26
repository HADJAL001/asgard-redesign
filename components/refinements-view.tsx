"use client"

/* ================================================================
   OSGARD · Раздел «Доработки» — премиум-хаб эволюции проектов
   ----------------------------------------------------------------
   Точка после первого БЕСПЛАТНОГО проекта (воронка «1 проект по IP»).
   Классическая воронка: первый проект гость получает без регистрации,
   а ДОРАБОТКИ — за стеной регистрации (регистрация даёт N бесплатных
   доработок, дальше — кредиты/тариф).

   Три состояния:
     • гость с проектом  → стена регистрации + оффер «N бесплатных доработок»;
     • реальный аккаунт  → баланс доработок + СЕТКА ВСЕХ проектов, каждый
       ведёт прямо во вкладку «Доработки» проекта (/projects/:id?tab=refine);
     • без проекта       → приглашение создать первый (в hero-форму).

   Связь «Проекты ↔ Доработки»: этот хаб перечисляет реальные проекты
   пользователя премиум-контейнерами и линкует в refine-вкладку каждого.
   Стиль — премиум-словарь (.premium-panel/.holo-title/.btn-premium-gold).
   ================================================================ */

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Wand2, Boxes, TrendingUp, Sparkles } from "lucide-react"
import { useAuth } from "@/lib/auth-store"
import { useOsgardStore } from "@/lib/store/osgard-store"
import { getGuestStatus, type GuestStatus } from "@/lib/guest-session"
import { badgeIcon } from "@/lib/economy"
import { useTranslation } from "@/lib/i18n/use-translation"
import { track } from "@/lib/analytics"

/* Сколько бесплатных доработок обещаем за регистрацию, пока B не подключил
   реальный счётчик. Держим в одном месте, чтобы синхронизировать оффер. */
const FREE_REFINEMENTS_ON_SIGNUP = 3

export function RefinementsView() {
  const router = useRouter()
  const { t } = useTranslation()
  const { isAuthenticated } = useAuth()
  const { projects, fetchProjects, refinementsRemaining } = useOsgardStore()
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

  const isGuest = !!status?.isGuest
  const isReal = !!status?.authenticated && !isGuest

  // Реальному аккаунту подгружаем список проектов для сетки доработок.
  useEffect(() => {
    if (isReal) fetchProjects({ skipAuthRedirect: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReal])

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
  const remaining = refinementsRemaining ?? status?.refinementsRemaining ?? null

  return (
    <div style={{ minHeight: "100vh", padding: "120px 20px 80px", display: "flex", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: isReal ? 1180 : 720 }}>
        {/* -------- Шапка раздела -------- */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div className="elite-eyebrow" style={{ marginBottom: 12 }}>{t("refine.hubEyebrow")}</div>
          <h1 className="holo-title" style={{ fontSize: "clamp(2rem, 5vw, 3rem)", margin: 0 }}>
            {t("refine.hubTitle")}
          </h1>
          <p style={{ color: "#8899bb", marginTop: 14, fontSize: "1.02rem", lineHeight: 1.6, maxWidth: 640, marginInline: "auto" }}>
            {t("refine.hubSubtitle")}
          </p>
        </div>

        {loading ? (
          <div className="premium-panel" style={{ padding: 32, textAlign: "center", color: "#8899bb", maxWidth: 720, marginInline: "auto" }}>
            {t("refine.submitting")}
          </div>
        ) : isReal ? (
          /* -------- Реальный аккаунт: баланс + сетка всех проектов -------- */
          <>
            <div className="premium-panel" style={{ padding: 28, marginBottom: 28 }}>
              <RefinementBalance remaining={remaining} freeOnSignup={FREE_REFINEMENTS_ON_SIGNUP} t={t} />
            </div>

            {projects.length === 0 ? (
              <div className="premium-panel" style={{ padding: 40, textAlign: "center", maxWidth: 720, marginInline: "auto" }}>
                <Sparkles size={36} strokeWidth={1.25} style={{ color: "var(--elite-gold, #f5c451)", margin: "0 auto" }} aria-hidden="true" />
                <p style={{ color: "#8899bb", marginTop: 16, marginBottom: 20, lineHeight: 1.6 }}>
                  {t("refine.hubNoProjects")}
                </p>
                <Link href="/" className="btn-premium-gold" style={{ display: "inline-block", textAlign: "center" }}>
                  {t("refine.hubCreateFirst")}
                </Link>
              </div>
            ) : (
              <>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    color: "#c8d2ea",
                    fontSize: ".95rem",
                    letterSpacing: ".02em",
                    marginBottom: 16,
                  }}
                >
                  <Wand2 size={16} strokeWidth={1.75} style={{ color: "var(--elite-gold, #f5c451)" }} aria-hidden="true" />
                  {t("refine.hubPickProject")}
                </div>
                <div className="refine-hub-grid">
                  {projects.map((p) => {
                    const BadgeIcon = badgeIcon(p.badge)
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          track("refinements_open_project", { projectId: p.id })
                          router.push(`/projects/${p.id}?tab=refine`)
                        }}
                        className="premium-panel refine-hub-card"
                        style={{
                          padding: 22,
                          textAlign: "left",
                          cursor: "pointer",
                          display: "flex",
                          flexDirection: "column",
                          gap: 12,
                          position: "relative",
                          overflow: "hidden",
                        }}
                      >
                        <span
                          aria-hidden="true"
                          style={{
                            position: "absolute",
                            insetInline: 0,
                            top: 0,
                            height: 1,
                            opacity: 0.6,
                            background: "linear-gradient(90deg, transparent, var(--elite-gold, #f5c451), transparent)",
                          }}
                        />
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <span
                            style={{
                              display: "flex",
                              width: 46,
                              height: 46,
                              alignItems: "center",
                              justifyContent: "center",
                              borderRadius: 12,
                              border: "1px solid rgba(245,196,81,0.45)",
                              background: "linear-gradient(135deg, rgba(245,196,81,0.12), rgba(245,196,81,0.02))",
                            }}
                          >
                            <BadgeIcon size={22} strokeWidth={1.25} style={{ color: "var(--elite-gold, #f5c451)" }} aria-hidden="true" />
                          </span>
                          <Wand2 size={16} strokeWidth={1.75} style={{ color: "#8899bb" }} aria-hidden="true" />
                        </div>

                        <div>
                          <div style={{ fontSize: "1.02rem", fontWeight: 600, color: "#e8eefc" }}>{p.name}</div>
                          <p
                            style={{
                              color: "#8899bb",
                              fontSize: ".88rem",
                              lineHeight: 1.5,
                              marginTop: 4,
                              display: "-webkit-box",
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: "vertical",
                              overflow: "hidden",
                            }}
                          >
                            {p.description || t("projects.noDescription")}
                          </p>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: 16, color: "#8899bb", fontSize: ".82rem", marginTop: "auto" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <Boxes size={13} strokeWidth={1.75} aria-hidden="true" />
                            {t("projects.artifactsCount", { count: p.artifactCount })}
                          </span>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <TrendingUp size={13} strokeWidth={1.75} aria-hidden="true" />
                            {t("projects.soldCount", { count: p.sold })}
                          </span>
                        </div>

                        <div
                          style={{
                            marginTop: 4,
                            paddingTop: 14,
                            borderTop: "1px solid rgba(245,196,81,0.14)",
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            color: "var(--elite-gold, #f5c451)",
                            fontWeight: 600,
                            fontSize: ".9rem",
                          }}
                        >
                          <Wand2 size={14} strokeWidth={1.75} aria-hidden="true" />
                          {t("refine.hubOpenProject")}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </>
        ) : (
          /* -------- Гость (или аноним) — стена регистрации -------- */
          <div className="premium-panel" style={{ padding: 32, maxWidth: 720, marginInline: "auto" }}>
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

      {/* Сетка премиум-карточек доработок — отзывчивая, с золотым hover */}
      <style jsx>{`
        .refine-hub-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 20px;
        }
        .refine-hub-card {
          transition: transform 0.3s ease, box-shadow 0.3s ease, border-color 0.3s ease;
        }
        .refine-hub-card:hover {
          transform: translateY(-4px);
          border-color: var(--elite-gold, #f5c451);
          box-shadow: 0 24px 60px -28px rgba(245, 196, 81, 0.45);
        }
      `}</style>
    </div>
  )
}

/* Баланс доработок реального аккаунта. Пока B не подключил счётчик
   (remaining === null) — нейтральная формулировка без выдуманных чисел. */
function RefinementBalance({
  remaining,
  freeOnSignup,
  t,
}: {
  remaining: number | null
  freeOnSignup: number
  t: (key: string, params?: Record<string, string | number>) => string
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <span
          style={{
            display: "flex",
            width: 52,
            height: 52,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 14,
            border: "1px solid rgba(245,196,81,0.45)",
            background: "linear-gradient(135deg, rgba(245,196,81,0.14), rgba(245,196,81,0.02))",
          }}
        >
          <Wand2 size={24} strokeWidth={1.5} style={{ color: "var(--elite-gold, #f5c451)" }} aria-hidden="true" />
        </span>
        <div>
          <div style={{ color: "#8899bb", fontSize: ".85rem", letterSpacing: ".02em" }}>{t("refine.hubBalanceTitle")}</div>
          {remaining === null ? (
            <div style={{ fontSize: "1.15rem", fontWeight: 600, color: "#e8eefc", marginTop: 2 }}>
              {t("refine.hubBalanceTitle")}
            </div>
          ) : (
            <div style={{ fontSize: "1.6rem", fontWeight: 700, color: "#e8eefc", marginTop: 2, lineHeight: 1.1 }}>
              {remaining > 0 ? (
                <>
                  <span style={{ color: "var(--elite-gold, #f5c451)" }}>{remaining}</span>{" "}
                  <span style={{ fontSize: "1rem", fontWeight: 500, color: "#8899bb" }}>{t("refine.free")}</span>
                </>
              ) : (
                <span style={{ fontSize: "1.05rem", fontWeight: 500, color: "#8899bb" }}>
                  {t("refine.costNote", { cost: 20 })}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
      {remaining !== null && remaining > 0 && (
        <div
          style={{
            padding: "8px 14px",
            borderRadius: 999,
            border: "1px solid rgba(245,196,81,0.4)",
            color: "var(--elite-gold, #f5c451)",
            fontSize: ".85rem",
            fontWeight: 600,
            background: "linear-gradient(135deg, rgba(245,196,81,0.1), transparent)",
          }}
        >
          {t("refine.freeChip", { count: remaining })}
        </div>
      )}
    </div>
  )
}
