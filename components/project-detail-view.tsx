"use client"

/* ================================================================
   ProjectDetailView — детали одного проекта OSGARD
   ----------------------------------------------------------------
   Использует useOsgardStore() (lib/store/osgard-store.tsx):
   - fetchProject(id) → GET /projects/:id — проект + его артефакты
   - clearCurrentProject() — сброс при размонтировании
   - deleteProject(id) → DELETE /projects/:id

   Отображает:
   - Хедер: иконка-бейдж, название, описание, кнопка "Назад",
     кнопка удаления проекта
   - Статистику: артефактов, продано, доход
   - Кнопку "Создать артефакт" (переход в кузницу с привязкой к проекту
     через query-параметр projectId)
   - Сетку артефактов проекта (аналогично artifacts-view, но
     отфильтровано по currentProjectArtifacts)
   ================================================================ */

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Hammer, Boxes, TrendingUp, Coins, Loader2, Trash2, Store, Archive, CheckCircle2 } from "lucide-react"
import { Navbar } from "./navbar"
import { useOsgardStore } from "@/lib/store/osgard-store"
import { COLORS, badgeIcon, RARITY, ARTIFACT_TYPES, STAT_META, type ArtifactType, type Rarity } from "@/lib/economy"
import { fmtTC, fmtUSD } from "@/lib/tc-market"
import { useTranslation } from "@/lib/i18n/use-translation"

type ArtifactStatus = "kept" | "listed" | "sold"

function safeType(t: string): ArtifactType {
  return (t in ARTIFACT_TYPES ? (t as ArtifactType) : "artifact")
}
function safeRarity(r: string): Rarity {
  return (r in RARITY ? (r as Rarity) : "common")
}

type Props = {
  projectId: number
}

export function ProjectDetailView({ projectId }: Props) {
  const { t } = useTranslation()
  const router = useRouter()
  const {
    currentProject,
    currentProjectArtifacts,
    fetchProject,
    clearCurrentProject,
    deleteProject,
    tcPrice,
    loading,
    error,
  } = useOsgardStore()

  const STATUS_META: Record<ArtifactStatus, { label: string; color: string; Icon: typeof Store }> = {
    listed: { label: t("artifacts.statusListed"), color: "#00D4FF", Icon: Store },
    kept: { label: t("artifacts.statusKept"), color: "#6A6A8A", Icon: Archive },
    sold: { label: t("artifacts.statusSold"), color: "#4ADE80", Icon: CheckCircle2 },
  }

  useEffect(() => {
    fetchProject(projectId, { skipAuthRedirect: true })
    return () => clearCurrentProject()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  async function handleDeleteProject() {
    if (!confirm(t("projects.confirmDelete"))) return
    const res = await deleteProject(projectId)
    if (res.success) router.push("/projects")
  }

  function goCreateArtifact() {
    router.push(`/forge?projectId=${projectId}`)
  }

  if (loading && !currentProject) {
    return (
      <div className="min-h-screen font-sans" style={{ background: "linear-gradient(180deg, #0A0A0F 0%, #14141E 100%)", color: COLORS.text }}>
        <Navbar />
        <main className="mx-auto flex max-w-[1240px] flex-col items-center gap-3 px-6 py-24 text-center">
          <Loader2 size={28} className="animate-spin" style={{ color: COLORS.accent }} />
          <p className="text-[14px]" style={{ color: COLORS.label }}>{t("projectDetail.loading")}</p>
        </main>
      </div>
    )
  }

  if (!currentProject) {
    return (
      <div className="min-h-screen font-sans" style={{ background: "linear-gradient(180deg, #0A0A0F 0%, #14141E 100%)", color: COLORS.text }}>
        <Navbar />
        <main className="mx-auto flex max-w-[1240px] flex-col items-center gap-4 px-6 py-24 text-center">
          <p className="text-[15px]" style={{ color: COLORS.label }}>{error || t("projectDetail.notFound")}</p>
          <button
            type="button"
            onClick={() => router.push("/projects")}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-medium"
            style={{ border: `1px solid ${COLORS.border}`, color: COLORS.text }}
          >
            <ArrowLeft size={16} strokeWidth={1.75} />
            {t("projectDetail.backToList")}
          </button>
        </main>
      </div>
    )
  }

  const BadgeIcon = badgeIcon(currentProject.badge)

  return (
    <div className="min-h-screen font-sans" style={{ background: "linear-gradient(180deg, #0A0A0F 0%, #14141E 100%)", color: COLORS.text }}>
      <Navbar />

      <main className="mx-auto max-w-[1240px] px-6 py-10 md:px-10 md:py-12">
        {/* Back link */}
        <button
          type="button"
          onClick={() => router.push("/projects")}
          className="inline-flex items-center gap-2 text-[13px] transition-colors"
          style={{ color: COLORS.label }}
          onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.text)}
          onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.label)}
        >
          <ArrowLeft size={14} strokeWidth={1.75} />
          {t("projectDetail.backToList")}
        </button>

        {/* Header */}
        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <span className="flex size-14 items-center justify-center rounded-xl" style={{ border: `1px solid ${COLORS.accent}` }}>
              <BadgeIcon size={26} strokeWidth={1.25} style={{ color: COLORS.accent }} />
            </span>
            <div>
              <h1 className="text-[28px] font-semibold leading-tight">{currentProject.name}</h1>
              <p className="mt-1 max-w-[520px] text-[14px]" style={{ color: "rgba(255,255,255,0.5)" }}>
                {currentProject.description || t("projects.noDescription")}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={goCreateArtifact}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-medium transition-opacity hover:opacity-90"
              style={{ backgroundColor: COLORS.accent, color: COLORS.bg }}
            >
              <Hammer size={16} strokeWidth={1.75} />
              {t("projectDetail.createArtifact")}
            </button>
            <button
              type="button"
              onClick={handleDeleteProject}
              title={t("projects.delete")}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-medium transition-colors"
              style={{ border: `1px solid ${COLORS.border}`, color: COLORS.red }}
            >
              <Trash2 size={16} strokeWidth={1.75} />
              {t("projects.delete")}
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-3">
          <div className="rounded-xl p-5" style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}>
            <Boxes size={18} strokeWidth={1.5} style={{ color: "#9B59B6" }} />
            <p className="mt-3 text-[22px] font-medium leading-none">{currentProject.artifactCount}</p>
            <p className="mt-2 text-[12px]" style={{ color: COLORS.label }}>{t("projectDetail.artifactsStat")}</p>
          </div>
          <div className="rounded-xl p-5" style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}>
            <TrendingUp size={18} strokeWidth={1.5} style={{ color: COLORS.green }} />
            <p className="mt-3 text-[22px] font-medium leading-none">{currentProject.sold}</p>
            <p className="mt-2 text-[12px]" style={{ color: COLORS.label }}>{t("projectDetail.soldStat")}</p>
          </div>
          <div className="rounded-xl p-5" style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}>
            <Coins size={18} strokeWidth={1.5} style={{ color: "#F1C40F" }} />
            <p className="mt-3 text-[22px] font-medium leading-none">{fmtTC(currentProject.income)}</p>
            <p className="mt-2 text-[12px]" style={{ color: COLORS.label }}>{t("projectDetail.incomeStat")}</p>
          </div>
        </div>

        {/* Artifacts */}
        <div className="mt-10">
          <h2 className="text-[18px] font-semibold">{t("projectDetail.artifactsTitle")}</h2>

          {currentProjectArtifacts.length === 0 ? (
            <div className="mt-6 flex flex-col items-center gap-4 rounded-2xl px-6 py-16 text-center" style={{ backgroundColor: COLORS.card, border: `1px dashed ${COLORS.border}` }}>
              <Boxes size={32} strokeWidth={1.25} style={{ color: COLORS.label }} />
              <p className="text-[15px]" style={{ color: COLORS.label }}>{t("projectDetail.noArtifacts")}</p>
              <button
                type="button"
                onClick={goCreateArtifact}
                className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-medium transition-opacity hover:opacity-90"
                style={{ backgroundColor: COLORS.accent, color: COLORS.bg }}
              >
                <Hammer size={16} strokeWidth={1.75} />
                {t("projectDetail.createArtifact")}
              </button>
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {currentProjectArtifacts.map((a) => {
                const TypeIcon = ARTIFACT_TYPES[safeType(a.type)].Icon
                const rarity = RARITY[safeRarity(a.rarity)]
                const status = STATUS_META[(a.status as ArtifactStatus) in STATUS_META ? (a.status as ArtifactStatus) : "kept"]
                const stats = { power: a.power, defense: a.defense, magic: a.magic, speed: a.speed }
                const isTimecoin = a.listCurrency === "timecoin"
                const priceLabel = isTimecoin ? fmtTC(a.price) : `${a.price.toLocaleString("ru-RU")} ${a.listCurrency}`
                const usdEstimate = isTimecoin ? fmtUSD(a.price * tcPrice.price) : null

                return (
                  <article
                    key={a.id}
                    className="flex flex-col rounded-xl p-5 transition-all duration-200"
                    style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = rarity.color
                      e.currentTarget.style.transform = "translateY(-2px)"
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = COLORS.border
                      e.currentTarget.style.transform = "translateY(0)"
                    }}
                  >
                    <div className="flex items-start justify-between">
                      <span className="flex size-12 items-center justify-center rounded-xl" style={{ border: `1px solid ${rarity.color}` }}>
                        <TypeIcon size={22} strokeWidth={1.25} style={{ color: rarity.color }} />
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px]" style={{ border: `1px solid ${COLORS.border}`, color: status.color }}>
                        <status.Icon size={12} strokeWidth={1.75} />
                        {status.label}
                      </span>
                    </div>

                    <h3 className="mt-4 text-[16px] font-medium">{a.name}</h3>
                    <div className="mt-1 flex items-center gap-2 text-[12px]">
                      <span style={{ color: COLORS.label }}>{ARTIFACT_TYPES[safeType(a.type)].label}</span>
                      <span style={{ color: COLORS.border }}>·</span>
                      <span style={{ color: COLORS.label }}>{t("artifacts.level", { level: a.level })}</span>
                      <span style={{ color: COLORS.border }}>·</span>
                      <span style={{ color: rarity.color }}>{rarity.label}</span>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2">
                      {STAT_META.map((s) => (
                        <div key={s.key} className="flex items-center justify-between rounded-lg px-3 py-1.5 text-[12px]" style={{ border: `1px solid ${COLORS.border}` }}>
                          <span style={{ color: COLORS.label }}>{s.label}</span>
                          <span>{stats[s.key]}</span>
                        </div>
                      ))}
                    </div>

                    <div className="mt-auto flex flex-col pt-5">
                      <span className="text-[15px] font-medium" style={{ color: COLORS.accent }}>
                        {priceLabel}
                      </span>
                      {usdEstimate && (
                        <span className="text-[11px]" style={{ color: COLORS.label }}>
                          ≈ {usdEstimate}
                        </span>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
