"use client"

/* ================================================================
   ProjectCreateWizard — модальный мастер создания проекта OSGARD
   ----------------------------------------------------------------
   3 шага:
   1. Название проекта
   2. Выбор темы (Sci-Fi, Fantasy, Cyberpunk, ...) — превращается в hint
      для AI-генерации или просто используется как описание при ручном
      создании
   3. Способ создания: AI-генерация (POST /projects/generate) или
      ручное создание (POST /projects)

   Прогресс-бар вверху показывает шаг 1/3 → 3/3.

   Использует useOsgardStore(): createProject(), generateProject()
   ================================================================ */

import { useState } from "react"
import { X, Sparkles, Wand2, PenLine, Loader2, ArrowRight, ArrowLeft, Check } from "lucide-react"
import { useOsgardStore } from "@/lib/store/osgard-store"
import { COLORS } from "@/lib/economy"
import { useTranslation } from "@/lib/i18n/use-translation"

type Theme = {
  id: string
  label: string
  hint: string
  badge: string
}

const CUSTOM_THEME_ID = "custom"

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
  initialMode?: "manual" | "ai"
  onClose: () => void
  onCreated: (projectId: number) => void
}

export function ProjectCreateWizard({ initialMode = "manual", onClose, onCreated }: Props) {
  const { t } = useTranslation()
  const { createProject, generateProject } = useOsgardStore()

  const [step, setStep] = useState(1)
  const [name, setName] = useState("")
  const [theme, setTheme] = useState<Theme | null>(null)
  const [customThemeText, setCustomThemeText] = useState("")
  const [mode, setMode] = useState<"manual" | "ai">(initialMode)
  const [description, setDescription] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aiSource, setAiSource] = useState<"ai" | "fallback" | null>(null)

  const totalSteps = 3
  const progress = (step / totalSteps) * 100

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
      if (mode === "ai") {
        const res = await generateProject(name.trim(), theme?.hint)
        if (res.success && res.project) {
          setAiSource(res.aiSource ?? null)
          onCreated(res.project.id)
        } else {
          setError(res.error || t("projectWizard.errorGenerate"))
        }
      } else {
        const res = await createProject(name.trim(), description.trim() || theme?.hint, theme?.badge)
        if (res.success && res.project) {
          onCreated(res.project.id)
        } else {
          setError(res.error || t("projectWizard.errorCreate"))
        }
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
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
        <div className="mt-6 min-h-[220px]">
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
                {t("projectWizard.methodLabel")}
              </label>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setMode("ai")}
                  className="flex flex-col items-start gap-2 rounded-xl p-4 text-left transition-colors"
                  style={{
                    border: `1px solid ${mode === "ai" ? COLORS.accent : COLORS.border}`,
                    backgroundColor: mode === "ai" ? "rgba(0,212,255,0.06)" : "transparent",
                  }}
                >
                  <Sparkles size={20} strokeWidth={1.5} style={{ color: COLORS.accent }} />
                  <span className="text-[14px] font-medium">{t("projectWizard.aiOption")}</span>
                  <span className="text-[12px]" style={{ color: COLORS.label }}>
                    {t("projectWizard.aiOptionDesc")}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setMode("manual")}
                  className="flex flex-col items-start gap-2 rounded-xl p-4 text-left transition-colors"
                  style={{
                    border: `1px solid ${mode === "manual" ? COLORS.accent : COLORS.border}`,
                    backgroundColor: mode === "manual" ? "rgba(0,212,255,0.06)" : "transparent",
                  }}
                >
                  <PenLine size={20} strokeWidth={1.5} style={{ color: COLORS.text }} />
                  <span className="text-[14px] font-medium">{t("projectWizard.manualOption")}</span>
                  <span className="text-[12px]" style={{ color: COLORS.label }}>
                    {t("projectWizard.manualOptionDesc")}
                  </span>
                </button>
              </div>

              {mode === "manual" && (
                <div className="mt-4">
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
                </div>
              )}

              {mode === "ai" && (
                <p className="mt-4 flex items-center gap-2 text-[12px]" style={{ color: COLORS.label }}>
                  <Wand2 size={14} strokeWidth={1.75} />
                  {t("projectWizard.aiWillGenerate", { name: name || "…", theme: theme?.label || t("projectWizard.noTheme") })}
                </p>
              )}
            </div>
          )}

          {error && (
            <p className="mt-4 text-[13px]" style={{ color: COLORS.red }}>
              {error}
            </p>
          )}
        </div>

        {/* Footer buttons */}
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
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-medium transition-opacity hover:opacity-90 disabled:opacity-60"
              style={{ backgroundColor: COLORS.accent, color: COLORS.bg }}
            >
              {submitting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  {mode === "ai" ? t("projectWizard.generating") : t("projectWizard.creating")}
                </>
              ) : (
                <>
                  <Check size={14} strokeWidth={1.75} />
                  {mode === "ai" ? t("projectWizard.generate") : t("projectWizard.create")}
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
