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
import { useOsgardStore, type OsgardArtifact } from "@/lib/store/osgard-store"
import { COLORS, RARITY, RARITY_CHAIN } from "@/lib/economy"
import { useTranslation } from "@/lib/i18n/use-translation"
import { apiClient } from "@/lib/api-client"
import { UpgradeNudgeModal, useUpgradeNudge } from "./UpgradeNudgeModal"
import { GenerationStages } from "./GenerationStages"
import { ProjectArtifactReveal, type RevealRarityMeta } from "./ProjectArtifactReveal"
import { GenerationCostEstimate, depthCostBadge, useGenerationEstimate } from "./GenerationCostEstimate"

/** rarityMeta для reveal строится из реальной экономики — знание таксономии
 *  (mythic=фольга, legendary=сияние) живёт здесь, а не в переиспользуемом компоненте. */
const REVEAL_RARITY_META: Record<string, RevealRarityMeta> = Object.fromEntries(
  RARITY_CHAIN.map((k) => {
    const r = RARITY[k]
    return [k, { label: r.label, color: r.color, symbol: r.symbol, glow: k === "mythic", shine: k === "legendary" }]
  }),
)

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
  { id: "scifi", label: "Sci-Fi", hint: "научно-фантастическая вселенная, космос, технологии будущего", badge: "rocket" },
  { id: "fantasy", label: "Fantasy", hint: "фэнтезийный мир, магия, мифические существа", badge: "wand" },
  { id: "cyberpunk", label: "Cyberpunk", hint: "киберпанк, неон, мегаполисы, хакеры, импланты", badge: "cpu" },
  { id: "mythology", label: "Mythology", hint: "древняя мифология, боги и герои, легенды", badge: "crown" },
  { id: "steampunk", label: "Steampunk", hint: "стимпанк, паровые механизмы, викторианская эпоха", badge: "cog" },
  { id: "postapoc", label: "Post-Apocalypse", hint: "постапокалипсис, выживание, руины цивилизации", badge: "skull" },
  { id: "horror", label: "Horror", hint: "мистический хоррор, потусторонние сущности, страх и напряжение", badge: "eye" },
  { id: "pirates", label: "Pirates", hint: "пиратские приключения, океаны, сокровища, абордажи", badge: "compass" },
  { id: "superhero", label: "Superhero", hint: "супергерои, суперспособности, спасение мира", badge: "shieldcheck" },
  { id: "noir", label: "Noir", hint: "детектив-нуар, расследования, тайны большого города", badge: "target" },
  { id: "western", label: "Western", hint: "дикий запад, ковбои, перестрелки, золотая лихорадка", badge: "trophy" },
  { id: "atlantis", label: "Atlantis", hint: "затонувшая цивилизация, подводный мир, древние артефакты", badge: "gem" },
]

type Props = {
  onClose: () => void
  onCreated: (projectId: number) => void
  /** Предзаполненное описание идеи. Нужен режиму разработчика (/dev), где
   *  человек уже описал приложение словом или голосом до открытия мастера —
   *  без этого текст пришлось бы вводить повторно. Необязателен: обычный
   *  режим вызывает мастер без него и работает ровно как раньше. */
  initialDescription?: string
  /** Идея уже полностью описана — шаги 1-2 (имя, тема) пропускаются, генерация
   *  запускается сразу при открытии мастера. Имя выводит бэкенд из описания
   *  (lib/project-title.ts), спрашивать его отдельно незачем: «первый клик
   *  создаёт проект». При ошибке мастер откатывается на обычные шаги, чтобы
   *  человек мог продолжить вручную, а не упереться в тупик. */
  autoStart?: boolean
}

export function ProjectCreateWizard({ onClose, onCreated, initialDescription = "", autoStart = false }: Props) {
  const { t } = useTranslation()
  const { generateProject, pollProjectStatus } = useOsgardStore()
  const wallet = useOsgardStore((s) => s.wallet)
  const { nudgeOpen, closeNudge, trackGeneration, usageData } = useUpgradeNudge()

  const [step, setStep] = useState(1)
  const [name, setName] = useState("")
  const [theme, setTheme] = useState<Theme | null>(null)
  const [customThemeText, setCustomThemeText] = useState("")
  const [description, setDescription] = useState(initialDescription)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** true, пока идёт фоновая генерация файлов реального приложения (после создания проекта). */
  const [generatingApp, setGeneratingApp] = useState(false)
  /** Данные для ритуала раскрытия артефактов — заполняются, когда проект готов. */
  const [reveal, setReveal] = useState<{ projectId: number; name: string; description?: string; artifacts: OsgardArtifact[] } | null>(null)
  /** Каталог глубин генерации + выбранная глубина (по умолчанию бесплатная quick). */
  const [depths, setDepths] = useState<DepthOption[]>([])
  const [depthId, setDepthId] = useState<DepthOption["id"]>("quick")
  /** autoStart уже запущен (эффект стартует ровно один раз, включая React strict-mode). */
  const [autoStarted, setAutoStarted] = useState(false)

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

  /* Смета ДО запуска (POST /projects/generation-estimate). Считается по замыслу, поэтому
     запрашивается только на шаге описания: раньше её просто нечем наполнить, а при
     autoStart шага нет вовсе — там глубина бесплатная (quick), и запуск не может стоить
     человеку кредитов. */
  const { estimate, loading: estimateLoading } = useGenerationEstimate({
    name: name.trim() || undefined,
    hint: description.trim() || theme?.hint,
    enabled: step === 3 && !autoStart,
  })

  /* Право на перегенерацию за счёт платформы делает запуск бесплатным независимо от
     баланса — блокировать кнопку по кредитам в этом случае было бы ложным отказом.
     Условие покрытия здесь то же, что на сервере (findMakegoodFor): право оплачивает
     глубину не дороже той, что провалилась. */
  const makegoodRight = estimate?.makegood.available ? estimate.makegood : null
  const makegoodApplies = !!makegoodRight && depthCost <= makegoodRight.credits
  const insufficientCredits = depthCost > 0 && wallet.credits < depthCost && !makegoodApplies

  const totalSteps = 3
  const progress = (step / totalSteps) * 100
  /** Мастер занят ритуалом (генерация или раскрытие), включая окно между
   *  автостартом и появлением generatingApp — прячем шаги, прогресс-бар и футер. */
  const busy = generatingApp || !!reveal || (autoStart && (submitting || !autoStarted))

  // «Первый клик создаёт проект»: идея уже описана — не спрашиваем имя/тему,
  // запускаем генерацию сразу при открытии мастера.
  useEffect(() => {
    if (autoStart && !autoStarted) {
      setAutoStarted(true)
      void handleSubmit()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    setError(null)
    setSubmitting(true)
    try {
      // Платная глубина требует достаточного баланса — проверяем до запроса, чтобы не ловить 402.
      if (insufficientCredits) {
        setError(t("projectWizard.insufficientCredits", { cost: depthCost, balance: wallet.credits }))
        setSubmitting(false)
        return
      }
      // POST /projects/generate отвечает сразу (проект уже создан, status='generating'),
      // а реальные файлы приложения генерируются в фоне на сервере — опрашиваем статус.
      // Собственное описание пользователя (если есть) важнее темы — это его реальный
      // бриф для генерации, тема лишь fallback-подсказка.
      const hint = description.trim() || theme?.hint
      const res = await generateProject(name.trim() || undefined, hint, depthId)
      if (res.success && res.project) {
        setGeneratingApp(true)
        const finalProject = await pollProjectStatus(res.project.id)
        setGeneratingApp(false)

        /* Трекаем генерацию для нуджа — вызываем после завершения */
        trackGeneration()

        if (finalProject?.status === "ready") {
          // Момент магии: если вместе с проектом родились артефакты — показываем
          // ритуал раскрытия, а не молча закрываем мастер. onDone продолжит в onCreated.
          if (res.artifacts && res.artifacts.length > 0) {
            setReveal({
              projectId: finalProject.id,
              name: finalProject.name,
              description: finalProject.description,
              artifacts: res.artifacts,
            })
          } else {
            onCreated(finalProject.id)
          }
        } else if (finalProject?.status === "failed") {
          setError(finalProject.generationError || t("projectWizard.generationFailed"))
        } else {
          // таймаут поллинга — проект всё ещё генерируется, но пользователь может
          // перейти к нему и посмотреть прогресс на странице проекта
          onCreated(res.project.id)
        }
      } else {
        setError(res.error || t("projectWizard.errorGenerate"))
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[560px] rounded-2xl p-6"
        style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-[18px] font-semibold">{t("projectWizard.title")}</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-lg transition-colors"
            style={{ color: COLORS.label }}
            onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.text)}
            onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.label)}
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        {/* Progress bar */}
        {!busy && (
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
        )}

        {/* Step content */}
        <div className="mt-6 min-h-[220px]">
          {reveal ? (
            <ProjectArtifactReveal
              projectName={reveal.name}
              projectDescription={reveal.description}
              artifacts={reveal.artifacts}
              rarityMeta={REVEAL_RARITY_META}
              onDone={() => onCreated(reveal.projectId)}
            />
          ) : generatingApp ? (
            <div>
              <p className="flex items-center gap-2 text-[14px] font-medium" style={{ color: COLORS.text }}>
                <Wand2 size={16} strokeWidth={1.75} style={{ color: COLORS.accent }} />
                {t("projectWizard.aiWillGenerate", {
                  name: name || "…",
                  theme: theme?.label || t("projectWizard.noTheme"),
                })}
              </p>
              <GenerationStages done={false} />
            </div>
          ) : autoStart && (submitting || !autoStarted) ? (
            <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
              <Loader2 size={22} className="animate-spin" style={{ color: COLORS.accent }} />
              <p className="text-[13px]" style={{ color: COLORS.label }}>
                {t("projectWizard.startingGeneration")}
              </p>
            </div>
          ) : (
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
                      const tooExpensive = d.credits > 0 && wallet.credits < d.credits && !makegoodApplies
                      /* Ожидаемый расход прямо на карточке: сравнение вариантов должно
                         быть возможно ДО выбора, а не после списания. */
                      const costBadge = depthCostBadge(estimate?.estimates?.[d.id])
                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => setDepthId(d.id)}
                          className="flex flex-col items-start gap-1 rounded-lg p-3 text-left transition-colors"
                          style={{
                            border: `1px solid ${active ? COLORS.accent : COLORS.border}`,
                            backgroundColor: active ? "rgba(0,212,255,0.06)" : "transparent",
                            opacity: tooExpensive && !active ? 0.55 : 1,
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
                            {d.credits > 0 ? (
                              <>
                                <Coins size={11} strokeWidth={2} />
                                {t("projectWizard.depthCost", { cost: d.credits })}
                              </>
                            ) : (
                              t("projectWizard.depthFree")
                            )}
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
          )}
        </div>

        {/* Footer buttons */}
        {!busy && (
        <div className="mt-6 flex items-center justify-between gap-3">
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
              disabled={submitting || insufficientCredits}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-medium transition-opacity hover:opacity-90 disabled:opacity-60"
              style={{ backgroundColor: COLORS.accent, color: COLORS.bg }}
            >
              {submitting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  {generatingApp ? t("projectWizard.generatingApp") : t("projectWizard.generating")}
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
        )}
      </div>
    </div>
    </>
  )
}
