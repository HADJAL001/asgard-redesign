"use client"

/* ================================================================
   ProjectCreateWizard — модальный мастер создания проекта OSGARD
   ----------------------------------------------------------------
   3 шага:
   1. Название проекта
   2. Выбор темы (Sci-Fi, Fantasy, Cyberpunk, ...) — становится hint'ом
      для генерации
   3. Описание + глубина генерации → POST /projects/generate

   Создание проекта всегда идёт через реальную генерацию: нет отдельного
   «ручного» пути без файлов и стартовых артефактов (был убран — он не
   писал project_files, из-за чего «Проверить» на таких проектах падало
   с «нет файлов для проверки», а пользователь не видел вообще никакого
   прогресса создания).

   Прогресс-бар вверху показывает шаг 1/3 → 3/3.

   Использует useOsgardStore(): generateProject()
   ================================================================ */

import { useEffect, useState } from "react"
import { X, Wand2, PenLine, Loader2, ArrowRight, ArrowLeft, Check, Coins } from "lucide-react"
import { useOsgardStore } from "@/lib/store/osgard-store"
import { COLORS } from "@/lib/economy"
import { useTranslation } from "@/lib/i18n/use-translation"
import { apiClient } from "@/lib/api-client"
import { UpgradeNudgeModal, useUpgradeNudge } from "./UpgradeNudgeModal"
import { GenerationCostEstimate, depthCostBadge, useGenerationEstimate } from "./GenerationCostEstimate"
import { buildProjectBrief, isProjectBriefComplete } from "@/lib/project-brief"

type Theme = {
  id: string
  label: string
  hint: string
  badge: string
}

const CUSTOM_THEME_ID = "custom"

/** Публичный каталог глубин генерации (GET /projects/generation-depths). Внутренние флаги
 *  (forceAi/bypassCache) сервер не отдаёт — здесь только то, что видит пользователь. */
type DepthOption = {
  id: "quick" | "standard" | "deep"
  label: string
  description: string
  credits: number
  countsAgainstQuota: boolean
}

const THEMES: Theme[] = [
  { id: "website", label: "Сайт", hint: "современный сайт с понятной структурой, адаптивной вёрсткой и целевым действием", badge: "rocket" },
  { id: "webapp", label: "Веб-приложение", hint: "веб-приложение с интерфейсом, состояниями и полезными сценариями для пользователя", badge: "cpu" },
  { id: "mobile", label: "Мобильное приложение", hint: "мобильное приложение с простым и удобным сценарием использования", badge: "smartphone" },
  { id: "marketplace", label: "Маркетплейс", hint: "маркетплейс с каталогом, карточками предложений и пользовательскими действиями", badge: "shoppingbag" },
  { id: "dashboard", label: "Личный кабинет", hint: "рабочий кабинет с данными, статусами, фильтрами и быстрыми действиями", badge: "layoutdashboard" },
  { id: "community", label: "Сообщество", hint: "платформа сообщества с профилями, публикациями и взаимодействием участников", badge: "users" },
  { id: "booking", label: "Запись и бронирование", hint: "сервис записи с выбором услуги, времени, подтверждением и уведомлениями", badge: "calendarcheck" },
  { id: "store", label: "Интернет-магазин", hint: "магазин с каталогом, корзиной, оформлением заказа и понятной витриной", badge: "store" },
  { id: "education", label: "Обучение", hint: "образовательный продукт с уроками, прогрессом и практическими заданиями", badge: "graduationcap" },
  { id: "productivity", label: "Рабочий сервис", hint: "сервис для командной работы, задач, процессов и контроля результата", badge: "briefcasebusiness" },
  { id: "content", label: "Медиа-проект", hint: "контентная платформа с публикациями, рубриками и удобным чтением", badge: "newspaper" },
  { id: "product", label: "Другая идея", hint: "нестандартный цифровой продукт под конкретную задачу и аудиторию", badge: "sparkles" },
]

type Props = {
  onClose: () => void
  onCreated: (projectId: number) => void
  /** Предзаполненное описание идеи. Нужен режиму разработчика (/dev), где
   *  человек уже описал приложение словом или голосом до открытия мастера —
   *  без этого текст пришлось бы вводить повторно. Необязателен: обычный
   *  режим вызывает мастер без него и работает ровно как раньше. */
  initialDescription?: string
}

export function ProjectCreateWizard({ onClose, onCreated, initialDescription = "" }: Props) {
  const { t } = useTranslation()
  const { generateProject } = useOsgardStore()
  const wallet = useOsgardStore((s) => s.wallet)
  const { nudgeOpen, closeNudge, trackGeneration, usageData } = useUpgradeNudge()

  const [step, setStep] = useState(1)
  const [name, setName] = useState("")
  const [theme, setTheme] = useState<Theme | null>(null)
  const [customThemeText, setCustomThemeText] = useState("")
  const [description, setDescription] = useState(initialDescription)
  const [brief, setBrief] = useState({ audience: "", outcome: "", essentials: "", constraints: "" })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Каталог глубин генерации + выбранная глубина (по умолчанию бесплатная quick). */
  const [depths, setDepths] = useState<DepthOption[]>([])
  const [depthId, setDepthId] = useState<DepthOption["id"]>("quick")

  // Каталог глубин — реальные тарифы из бэкенда (не хардкод), подтягиваем один раз при монтировании.
  useEffect(() => {
    let cancelled = false
    apiClient
      .get<{ depths: DepthOption[] }>("/projects/generation-depths")
      .then((res) => {
        if (!cancelled && Array.isArray(res.depths)) setDepths(res.depths)
      })
      .catch(() => {
        /* каталог необязателен — при недоступности остаётся дефолтная quick-генерация */
      })
    return () => {
      cancelled = true
    }
  }, [])

  const selectedDepth = depths.find((d) => d.id === depthId) ?? null
  const depthCost = selectedDepth?.credits ?? 0

  /* Смета ДО запуска (POST /projects/generation-estimate). Считается по замыслу,
     поэтому запрашивается только на шаге описания, когда контекст уже заполнен. */
  const { estimate, loading: estimateLoading } = useGenerationEstimate({
    name: name.trim() || undefined,
    hint: description.trim() || theme?.hint,
    enabled: step === 3,
  })

  /* Право на перегенерацию за счёт платформы делает запуск бесплатным независимо от
     баланса — блокировать кнопку по кредитам в этом случае было бы ложным отказом.
     Условие покрытия здесь то же, что на сервере (findMakegoodFor): право оплачивает
     глубину не дороже той, что провалилась. */
  const makegoodRight = estimate?.makegood.available ? estimate.makegood : null
  const makegoodApplies = !!makegoodRight && depthCost <= makegoodRight.credits
  const insufficientCredits = !makegoodApplies && depthCost > wallet.credits
  const insufficientTimecoin = wallet.timecoin < 1

  const totalSteps = 3
  const progress = (step / totalSteps) * 100
  const briefReady = isProjectBriefComplete(brief)

  function goNext() {
    setError(null)
    if (step === 1) {
      if (!name.trim()) {
        setError(t("projectWizard.errorNameRequired"))
        return
      }
    }
    setStep((s) => Math.min(totalSteps, s + 1))
  }

  function goBack() {
    setError(null)
    setStep((s) => Math.max(1, s - 1))
  }

  async function handleSubmit() {
    if (!briefReady) {
      setError(t("projectWizard.errorBriefRequired"))
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      // Баланс проверяет сервер атомарно: локальный store при холодной загрузке может ещё содержать ноль.
      // POST /projects/generate отвечает сразу (проект уже создан, status='generating'),
      // а реальные файлы приложения генерируются в фоне на сервере — опрашиваем статус.
      // Собственное описание пользователя (если есть) важнее темы — это его реальный
      // бриф для генерации, тема лишь fallback-подсказка.
      const hint = buildProjectBrief(description.trim() || theme?.hint || "", brief)
      const res = await generateProject(name.trim() || undefined, hint, depthId)
      if (res.success && res.project) {
        // Project generation is asynchronous. The workspace owns the live SSE
        // stream and recovery polling, so move there as soon as the project exists.
        trackGeneration()
        onCreated(res.project.id)
      } else {
        setError(
          res.code === "GENERATION_PROVIDERS_UNAVAILABLE"
            ? t("landing.generationProvidersUnavailable")
            : res.error || t("projectWizard.errorGenerate"),
        )
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
    {/* Нудж апгрейда — показывается поверх wizard после 3+ генераций */}
    <UpgradeNudgeModal
      open={nudgeOpen}
      onClose={closeNudge}
      generationsToday={usageData?.generations?.used ?? 0}
      limit={usageData?.generations?.limit ?? 5}
    />

    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-hidden p-2 sm:items-center sm:p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-create-title"
        onKeyDown={(event) => {
          if (event.key === "Escape" && !submitting) onClose()
        }}
        className="flex max-h-[calc(100dvh-1rem)] w-full max-w-[560px] flex-col rounded-xl p-4 sm:max-h-[calc(100dvh-2rem)] sm:rounded-2xl sm:p-6"
        style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between">
          <h2 id="project-create-title" className="text-[18px] font-semibold">{t("projectWizard.title")}</h2>
          <button
            type="button"
            onClick={() => {
              if (!submitting) onClose()
            }}
            disabled={submitting}
            aria-label={t("projectWizard.cancel")}
            className="flex size-8 items-center justify-center rounded-lg transition-colors"
            style={{ color: COLORS.label, opacity: submitting ? 0.45 : 1 }}
            onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.text)}
            onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.label)}
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        {/* Progress bar */}
        <div className="mt-4">
            <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: COLORS.border }}>
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{ width: `${progress}%`, backgroundColor: COLORS.accent }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px]" style={{ color: COLORS.label }}>
              <span>{t("projectWizard.stepOf", { step, total: totalSteps })}</span>
              <span>
                {step === 1 && t("projectWizard.step1Label")}
                {step === 2 && t("projectWizard.step2Label")}
                {step === 3 && t("projectWizard.step3Label")}
              </span>
            </div>
        </div>

        {/* Step content */}
        <div className="mt-5 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 sm:mt-6 sm:min-h-[220px]">
          <>
          {step === 1 && (
            <div>
              <label className="text-[13px] font-medium" style={{ color: COLORS.text }}>
                {t("projectWizard.nameLabel")}
              </label>
              <input
                type="text"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("projectWizard.namePlaceholder")}
                className="cal-input mt-2"
                onKeyDown={(e) => e.key === "Enter" && goNext()}
              />
              <p className="mt-3 text-[12px]" style={{ color: COLORS.label }}>
                {t("projectWizard.nameHint")}
              </p>
            </div>
          )}

          {step === 2 && (
            <div>
              <label className="text-[13px] font-medium" style={{ color: COLORS.text }}>
                {t("projectWizard.themeLabel")}
              </label>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {THEMES.map((th) => {
                  const active = theme?.id === th.id
                  return (
                    <button
                      key={th.id}
                      type="button"
                      onClick={() => setTheme(active ? null : th)}
                      className="rounded-lg px-3 py-3 text-[13px] font-medium transition-colors"
                      style={{
                        border: `1px solid ${active ? COLORS.accent : COLORS.border}`,
                        color: active ? COLORS.accent : COLORS.text,
                        backgroundColor: active ? "rgba(0,212,255,0.06)" : "transparent",
                      }}
                    >
                      {th.label}
                    </button>
                  )
                })}
                {(() => {
                  const active = theme?.id === CUSTOM_THEME_ID
                  return (
                    <button
                      type="button"
                      onClick={() =>
                        setTheme(
                          active
                            ? null
                            : {
                                id: CUSTOM_THEME_ID,
                                label: customThemeText.trim() || t("projectWizard.customThemeLabel"),
                                hint: customThemeText.trim(),
                                badge: "sparkles",
                              },
                        )
                      }
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-3 text-[13px] font-medium transition-colors"
                      style={{
                        border: `1px solid ${active ? COLORS.accent : COLORS.border}`,
                        color: active ? COLORS.accent : COLORS.text,
                        backgroundColor: active ? "rgba(0,212,255,0.06)" : "transparent",
                      }}
                    >
                      <PenLine size={14} strokeWidth={1.75} />
                      {t("projectWizard.customThemeOption")}
                    </button>
                  )
                })()}
              </div>

              {theme?.id === CUSTOM_THEME_ID && (
                <input
                  type="text"
                  autoFocus
                  value={customThemeText}
                  onChange={(e) => {
                    const value = e.target.value
                    setCustomThemeText(value)
                    setTheme({
                      id: CUSTOM_THEME_ID,
                      label: value.trim() || t("projectWizard.customThemeLabel"),
                      hint: value.trim(),
                      badge: "sparkles",
                    })
                  }}
                  placeholder={t("projectWizard.customThemePlaceholder")}
                  className="cal-input mt-3"
                />
              )}

              <p className="mt-3 text-[12px]" style={{ color: COLORS.label }}>
                {t("projectWizard.themeHint")}
              </p>
            </div>
          )}

          {step === 3 && (
            <div>
              <label className="text-[13px] font-medium" style={{ color: COLORS.text }}>
                {t("projectWizard.descriptionLabel")}
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={theme?.hint || t("projectWizard.descriptionPlaceholder")}
                rows={3}
                className="cal-input mt-2 resize-none"
              />
              <p className="mt-2 text-[12px]" style={{ color: COLORS.label }}>
                {t("projectWizard.descriptionHint")}
              </p>

              <div className="mt-5 border-t pt-5" style={{ borderColor: COLORS.border }}>
                <p className="text-[13px] font-medium" style={{ color: COLORS.text }}>{t("projectWizard.briefTitle")}</p>
                <p className="mt-1 text-[12px]" style={{ color: COLORS.label }}>{t("projectWizard.briefHint")}</p>
                <div className="mt-4 grid gap-3">
                  <label className="text-[12px] font-medium" style={{ color: COLORS.text }}>
                    {t("projectWizard.audienceLabel")}
                    <input value={brief.audience} onChange={(e) => setBrief((current) => ({ ...current, audience: e.target.value }))} placeholder={t("projectWizard.audiencePlaceholder")} maxLength={240} className="cal-input mt-1.5" />
                  </label>
                  <label className="text-[12px] font-medium" style={{ color: COLORS.text }}>
                    {t("projectWizard.outcomeLabel")}
                    <input value={brief.outcome} onChange={(e) => setBrief((current) => ({ ...current, outcome: e.target.value }))} placeholder={t("projectWizard.outcomePlaceholder")} maxLength={240} className="cal-input mt-1.5" />
                  </label>
                  <label className="text-[12px] font-medium" style={{ color: COLORS.text }}>
                    {t("projectWizard.essentialsLabel")}
                    <textarea value={brief.essentials} onChange={(e) => setBrief((current) => ({ ...current, essentials: e.target.value }))} placeholder={t("projectWizard.essentialsPlaceholder")} maxLength={600} rows={3} className="cal-input mt-1.5 resize-none" />
                  </label>
                  <label className="text-[12px] font-medium" style={{ color: COLORS.text }}>
                    {t("projectWizard.constraintsLabel")}
                    <input value={brief.constraints} onChange={(e) => setBrief((current) => ({ ...current, constraints: e.target.value }))} placeholder={t("projectWizard.constraintsPlaceholder")} maxLength={400} className="cal-input mt-1.5" />
                  </label>
                </div>
              </div>

              {depths.length > 0 && (
                <div className="mt-4">
                  <div className="flex items-center justify-between">
                    <label className="text-[13px] font-medium" style={{ color: COLORS.text }}>
                      {t("projectWizard.depthLabel")}
                    </label>
                    <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: COLORS.label }}>
                      <Coins size={12} strokeWidth={1.75} />
                      {t("projectWizard.balance", { balance: wallet.credits })}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {depths.map((d) => {
                      const active = depthId === d.id
                      const coveredByMakegood = !!makegoodRight && d.credits <= makegoodRight.credits
                      const tooExpensive = d.credits > wallet.credits && !coveredByMakegood
                      /* Ожидаемый расход прямо на карточке: сравнение вариантов должно
                         быть возможно ДО выбора, а не после списания. */
                      const costBadge = depthCostBadge(estimate?.estimates?.[d.id])
                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => setDepthId(d.id)}
                          disabled={tooExpensive}
                          className="flex flex-col items-start gap-1 rounded-lg p-3 text-left transition-colors"
                          style={{
                            border: `1px solid ${active ? COLORS.accent : COLORS.border}`,
                            backgroundColor: active ? "rgba(0,212,255,0.06)" : "transparent",
                            opacity: tooExpensive ? 0.55 : 1,
                          }}
                        >
                          <span className="text-[13px] font-medium" style={{ color: active ? COLORS.accent : COLORS.text }}>
                            {d.label}
                          </span>
                          <span className="text-[11px] leading-snug" style={{ color: COLORS.label }}>
                            {d.description}
                          </span>
                          <span
                            className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium"
                            style={{ color: d.credits > 0 ? COLORS.amber : COLORS.green }}
                          >
                            <Coins size={11} strokeWidth={2} />
                            {d.credits > 0 ? t("projectWizard.depthCost", { cost: d.credits }) : t("projectWizard.depthFree")}
                          </span>
                          {costBadge && (
                            <span className="text-[10px]" style={{ color: COLORS.label }}>
                              {costBadge}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                  {insufficientTimecoin && (
                    <p className="mt-2 text-[12px]" style={{ color: COLORS.red }}>
                      {t("projectWizard.insufficientTimecoin", { balance: wallet.timecoin })}
                    </p>
                  )}
                  {insufficientCredits && (
                    <p className="mt-2 text-[12px]" style={{ color: COLORS.red }}>
                      {t("projectWizard.insufficientCredits", { cost: depthCost, balance: wallet.credits })}
                    </p>
                  )}
                </div>
              )}

              {/* Смета ДО запуска: расход, время, шанс собраться с первого раза и право на
                  перегенерацию за счёт платформы — всё до нажатия кнопки, а не после. */}
              <GenerationCostEstimate estimate={estimate} depthId={depthId} loading={estimateLoading} />

              <p className="mt-4 flex items-center gap-2 text-[12px]" style={{ color: COLORS.label }}>
                <Wand2 size={14} strokeWidth={1.75} />
                {t("projectWizard.aiWillGenerate", { name: name || "…", theme: theme?.label || t("projectWizard.noTheme") })}
              </p>
            </div>
          )}

          {error && (
            <p className="mt-4 text-[13px]" style={{ color: COLORS.red }}>
              {error}
            </p>
          )}
          </>
        </div>

        {/* Footer buttons */}
        <div className="mt-4 flex shrink-0 items-center justify-between gap-3 border-t pt-4 sm:mt-6" style={{ borderColor: COLORS.border }}>
          <button
            type="button"
            onClick={step === 1 ? onClose : goBack}
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-medium transition-colors disabled:opacity-50"
            style={{ border: `1px solid ${COLORS.border}`, color: COLORS.text }}
          >
            <ArrowLeft size={14} strokeWidth={1.75} />
            {step === 1 ? t("projectWizard.cancel") : t("projectWizard.back")}
          </button>

          {step < totalSteps ? (
            <button
              type="button"
              onClick={goNext}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-medium transition-opacity hover:opacity-90"
              style={{ backgroundColor: COLORS.accent, color: COLORS.bg }}
            >
              {t("projectWizard.next")}
              <ArrowRight size={14} strokeWidth={1.75} />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || !briefReady || insufficientCredits || insufficientTimecoin}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-medium transition-opacity hover:opacity-90 disabled:opacity-60"
              style={{ backgroundColor: COLORS.accent, color: COLORS.bg }}
            >
              {submitting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  {t("projectWizard.generating")}
                </>
              ) : (
                <>
                  <Check size={14} strokeWidth={1.75} />
                  {t("projectWizard.generate")}
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
    </>
  )
}
