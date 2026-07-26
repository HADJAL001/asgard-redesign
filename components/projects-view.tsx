"use client"

/* ================================================================
   ProjectsView — Мои проекты OSGARD
   ----------------------------------------------------------------
   Использует useOsgardStore() (lib/store/osgard-store.tsx):
   - fetchProjects() → GET /projects/mine — список проектов пользователя
   - deleteProject(id) → DELETE /projects/:id

   Отображает:
   - Заголовок + кнопки "Создать проект" (открывает wizard) и
     "Создать с AI" (тоже открывает wizard, но сразу на шаге AI)
   - Сетку карточек проектов: название, описание, бейдж-иконка,
     количество артефактов, продано, доход
   - Пустое состояние, если проектов ещё нет
   - Модалку с ProjectCreateWizard
   ================================================================ */

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, Sparkles, FolderKanban, Boxes, TrendingUp, Coins, Loader2, Trash2, Wand2 } from "lucide-react"
import { Navbar } from "./navbar"
import { useOsgardStore } from "@/lib/store/osgard-store"
import { COLORS, badgeIcon } from "@/lib/economy"
import { fmtTC } from "@/lib/tc-market"
import { useTranslation } from "@/lib/i18n/use-translation"
import { ProjectCreateWizard } from "./project-create-wizard"
import { PremiumBackground } from "./premium-bg"
import { SectionHelp } from "./section-help"

export function ProjectsView() {
  const { t } = useTranslation()
  const router = useRouter()
  const { projects, fetchProjects, deleteProject, loading, error } = useOsgardStore()

  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardStartMode, setWizardStartMode] = useState<"manual" | "ai">("manual")
  const [deletingId, setDeletingId] = useState<number | null>(null)

  useEffect(() => {
    fetchProjects({ skipAuthRedirect: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function openManualWizard() {
    setWizardStartMode("manual")
    setWizardOpen(true)
  }

  function openAiWizard() {
    setWizardStartMode("ai")
    setWizardOpen(true)
  }

  async function handleDelete(id: number, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm(t("projects.confirmDelete"))) return
    setDeletingId(id)
    try {
      await deleteProject(id)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden font-sans" style={{ background: "linear-gradient(180deg, #0A0A0F 0%, #14141E 100%)", color: COLORS.text }}>
      <PremiumBackground variant="ideas" />
      <Navbar />
      <SectionHelp
        title="Мой мир — проекты"
        what="Здесь живут ваши проекты — реальные приложения, сгенерированные ИИ. Клик по карточке открывает Мастерскую: слева файлы и редактор кода, справа живой запуск приложения прямо в браузере, снизу чат с Клодом для доработок."
        goals={[
          { goal: "Создать проект с ИИ", steps: ["Нажмите «Создать с AI»", "Опишите идею словами", "ИИ сгенерирует настоящий код и артефакты"] },
          { goal: "Попасть внутрь проекта", steps: ["Кликните по карточке — откроется Мастерская", "Конвейер сверху показывает: Замысел → Клод пишет код → Компилятор → Запуск → Деплой", "Кнопка «Запустить» поднимает приложение прямо во вкладке браузера"] },
        ]}
        tour={[
          { target: "projects-create-ai", title: "Создать с AI", text: "Главная кнопка: опишите любую идею — VPN, маркетплейс, игру — ИИ соберёт реальный проект." },
          { title: "Карточки проектов", text: "Клик по карточке ведёт ВНУТРЬ проекта — в Мастерскую: код, живой запуск и доработка словами на одном экране." },
        ]}
      />

      <main className="relative z-10 mx-auto max-w-[1240px] px-6 py-10 md:px-10 md:py-12">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg" style={{ border: `1px solid ${COLORS.border}` }}>
              <FolderKanban size={18} strokeWidth={1.5} style={{ color: COLORS.accent }} aria-hidden="true" />
            </span>
            <div>
              <h1 className="text-[32px] font-semibold leading-tight">{t("projects.title")}</h1>
              <p className="mt-0.5 text-[14px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                {t("projects.subtitle")}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={openManualWizard}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-medium transition-colors"
              style={{ border: `1px solid ${COLORS.border}`, color: COLORS.text }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = COLORS.accent; e.currentTarget.style.color = COLORS.accent }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = COLORS.border; e.currentTarget.style.color = COLORS.text }}
            >
              <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
              {t("projects.createBtn")}
            </button>
            <button
              type="button"
              data-tour="projects-create-ai"
              onClick={openAiWizard}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-medium transition-opacity hover:opacity-90"
              style={{ backgroundColor: COLORS.accent, color: COLORS.bg }}
            >
              <Sparkles size={16} strokeWidth={1.75} aria-hidden="true" />
              {t("projects.createAiBtn")}
            </button>
          </div>
        </div>

        {/* Summary */}
        <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { n: `${projects.length}`, l: t("projects.totalProjects"), Icon: FolderKanban, c: COLORS.accent },
            { n: `${projects.reduce((s, p) => s + p.artifactCount, 0)}`, l: t("projects.totalArtifacts"), Icon: Boxes, c: "#9B59B6" },
            { n: `${projects.reduce((s, p) => s + p.sold, 0)}`, l: t("projects.totalSold"), Icon: TrendingUp, c: COLORS.green },
            { n: fmtTC(projects.reduce((s, p) => s + p.income, 0)), l: t("projects.totalIncome"), Icon: Coins, c: "#F1C40F" },
          ].map((m) => (
            <div key={m.l} className="rounded-xl p-5" style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}>
              <m.Icon size={18} strokeWidth={1.5} style={{ color: m.c }} aria-hidden="true" />
              <p className="mt-3 text-[22px] font-medium leading-none">{m.n}</p>
              <p className="mt-2 text-[12px]" style={{ color: COLORS.label }}>{m.l}</p>
            </div>
          ))}
        </div>

        {/* Loading */}
        {loading && projects.length === 0 && (
          <div className="mt-16 flex flex-col items-center gap-3 text-center">
            <Loader2 size={28} className="animate-spin" style={{ color: COLORS.accent }} />
            <p className="text-[14px]" style={{ color: COLORS.label }}>{t("projects.loading")}</p>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <p className="mt-6 text-[13px]" role="status" style={{ color: COLORS.red }}>
            {error}
          </p>
        )}

        {/* Empty state */}
        {!loading && projects.length === 0 ? (
          <div className="mt-16 flex flex-col items-center gap-4 rounded-2xl px-6 py-16 text-center" style={{ backgroundColor: COLORS.card, border: `1px dashed ${COLORS.border}` }}>
            <FolderKanban size={40} strokeWidth={1.25} style={{ color: COLORS.label }} aria-hidden="true" />
            <p className="text-[15px]" style={{ color: COLORS.label }}>{t("projects.empty")}</p>
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={openManualWizard}
                className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-medium transition-colors"
                style={{ border: `1px solid ${COLORS.border}`, color: COLORS.text }}
              >
                <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
                {t("projects.createBtn")}
              </button>
              <button
                type="button"
                onClick={openAiWizard}
                className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-medium transition-opacity hover:opacity-90"
                style={{ backgroundColor: COLORS.accent, color: COLORS.bg }}
              >
                <Sparkles size={16} strokeWidth={1.75} aria-hidden="true" />
                {t("projects.createAiBtn")}
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => {
              const BadgeIcon = badgeIcon(p.badge)
              const isDeleting = deletingId === p.id
              return (
                <article
                  key={p.id}
                  /* Клик по карточке ведёт ВНУТРЬ проекта — в Мастерскую (код,
                     живой запуск, чат с Клодом), а не на экономическую витрину.
                     Раньше здесь был /projects/:id, и человек после создания
                     приложения попадал на артефакты/доход, а само приложение
                     оставалось за мелкими вкладками. «Паспорт проекта» никуда
                     не делся — ссылка на него есть в шапке Мастерской. */
                  onClick={() => router.push(`/projects/${p.id}/workspace`)}
                  className="premium-panel group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl p-5 transition-all duration-300"
                  style={{ border: `1px solid ${COLORS.border}` }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "var(--elite-gold, #f5c451)"
                    e.currentTarget.style.transform = "translateY(-4px)"
                    e.currentTarget.style.boxShadow = "0 24px 60px -28px rgba(245,196,81,0.45)"
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = COLORS.border
                    e.currentTarget.style.transform = "translateY(0)"
                    e.currentTarget.style.boxShadow = "none"
                  }}
                >
                  {/* Верхняя золотая линия-хайлайт */}
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 top-0 h-px opacity-60"
                    style={{ background: "linear-gradient(90deg, transparent, var(--elite-gold, #f5c451), transparent)" }}
                  />
                  {/* Мягкое золотое свечение при наведении */}
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute -right-16 -top-16 size-40 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100"
                    style={{ background: "radial-gradient(circle, rgba(245,196,81,0.16), transparent 70%)" }}
                  />

                  <div className="relative flex items-start justify-between">
                    <span
                      className="flex size-12 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-105"
                      style={{
                        border: `1px solid rgba(245,196,81,0.45)`,
                        background: "linear-gradient(135deg, rgba(245,196,81,0.12), rgba(245,196,81,0.02))",
                      }}
                    >
                      <BadgeIcon size={22} strokeWidth={1.25} style={{ color: "var(--elite-gold, #f5c451)" }} aria-hidden="true" />
                    </span>
                    <button
                      type="button"
                      onClick={(e) => handleDelete(p.id, e)}
                      disabled={isDeleting}
                      title={t("projects.delete")}
                      className="flex size-8 items-center justify-center rounded-lg opacity-0 transition-opacity group-hover:opacity-100 disabled:cursor-not-allowed"
                      style={{ border: `1px solid ${COLORS.border}`, color: COLORS.red }}
                    >
                      {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} strokeWidth={1.75} aria-hidden="true" />}
                    </button>
                  </div>

                  <h3 className="relative mt-4 text-[16px] font-semibold tracking-tight">{p.name}</h3>
                  <p className="relative mt-1 line-clamp-2 text-[13px]" style={{ color: COLORS.label }}>
                    {p.description || t("projects.noDescription")}
                  </p>

                  <div className="relative mt-auto flex items-center justify-between gap-2 pt-5 text-[12px]" style={{ color: COLORS.label }}>
                    <span className="inline-flex items-center gap-1.5">
                      <Boxes size={13} strokeWidth={1.75} aria-hidden="true" />
                      {t("projects.artifactsCount", { count: p.artifactCount })}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <TrendingUp size={13} strokeWidth={1.75} aria-hidden="true" />
                      {t("projects.soldCount", { count: p.sold })}
                    </span>
                  </div>
                  {p.income > 0 && (
                    <div className="relative mt-2 text-[13px] font-medium" style={{ color: "#F1C40F" }}>
                      {fmtTC(p.income)}
                    </div>
                  )}

                  {/* Премиальная кнопка «Доработать» — прямая связь Проекты → Доработки */}
                  <div className="relative mt-4 border-t pt-4" style={{ borderColor: COLORS.border }}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        // Доработка теперь живёт рядом с кодом и превью — в Мастерской.
                        router.push(`/projects/${p.id}/workspace`)
                      }}
                      className="flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-[13px] font-semibold transition-all duration-200"
                      style={{
                        color: "var(--elite-gold, #f5c451)",
                        border: "1px solid rgba(245,196,81,0.35)",
                        background: "linear-gradient(135deg, rgba(245,196,81,0.08), transparent)",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "linear-gradient(135deg, rgba(245,196,81,0.18), rgba(245,196,81,0.04))"
                        e.currentTarget.style.borderColor = "var(--elite-gold, #f5c451)"
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "linear-gradient(135deg, rgba(245,196,81,0.08), transparent)"
                        e.currentTarget.style.borderColor = "rgba(245,196,81,0.35)"
                      }}
                    >
                      <Wand2 size={14} strokeWidth={1.75} aria-hidden="true" />
                      {t("refine.cardRefine")}
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </main>

      {wizardOpen && (
        <ProjectCreateWizard
          initialMode={wizardStartMode}
          onClose={() => setWizardOpen(false)}
          onCreated={(projectId: number) => {
            setWizardOpen(false)
            // Сразу внутрь: человек видит, как рождается его приложение —
            // живой лог стадий, файлы по мере готовности, кнопку запуска.
            router.push(`/projects/${projectId}/workspace`)
          }}
        />
      )}
    </div>
  )
}
