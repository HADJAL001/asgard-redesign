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

import { createElement, useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  ArrowLeft, Hammer, Boxes, TrendingUp, Coins, Loader2, Trash2, Store, Archive, CheckCircle2,
  Rocket, Download, ExternalLink, AlertTriangle, Code2, Link2,
} from "lucide-react"
import { Navbar } from "./navbar"
import { ProjectFileEditor } from "./project-file-editor"
import { useOsgardStore } from "@/lib/store/osgard-store"
import { useAuth } from "@/lib/auth-store"
import { COLORS, badgeIcon, RARITY, ARTIFACT_TYPES, STAT_META, type ArtifactType, type Rarity } from "@/lib/economy"
import { fmtTC, fmtUSD } from "@/lib/tc-market"
import { useTranslation } from "@/lib/i18n/use-translation"
import { API_BASE_URL } from "@/lib/api-client"

type ArtifactStatus = "kept" | "listed" | "sold"

function GithubIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.57.1.78-.25.78-.55v-2.02c-3.2.7-3.88-1.54-3.88-1.54-.52-1.34-1.28-1.69-1.28-1.69-1.04-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.64 1.6.24 2.76.12 3.05.74.81 1.18 1.84 1.18 3.1 0 4.43-2.7 5.4-5.26 5.69.41.36.78 1.06.78 2.14v3.17c0 .3.2.66.79.55A10.52 10.52 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  )
}

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
  const searchParams = useSearchParams()
  const { user, refreshMe } = useAuth()
  const {
    currentProject,
    currentProjectArtifacts,
    fetchProject,
    clearCurrentProject,
    deleteProject,
    publishProjectToGithub,
    deployProjectToNetlify,
    pollDeployStatus,
    tcPrice,
    loading,
    error,
  } = useOsgardStore()

  const [tab, setTab] = useState<"artifacts" | "files">("artifacts")
  const [publishing, setPublishing] = useState(false)
  const [publishResult, setPublishResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [deploying, setDeploying] = useState(false)
  const [deployRequestError, setDeployRequestError] = useState<string | null>(null)

  const badgeIconComponent = useMemo(() => badgeIcon(currentProject?.badge ?? ""), [currentProject?.badge])

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

  useEffect(() => {
    const connected = searchParams.get("githubPublishConnected")
    if (connected === null) return
    if (connected === "1") {
      refreshMe()
      Promise.resolve().then(() => setPublishResult({ ok: true, message: t("projectDetail.githubConnected") }))
    } else {
      Promise.resolve().then(() => setPublishResult({ ok: false, message: t("projectDetail.githubConnectFailed") }))
    }
    router.replace(`/projects/${projectId}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  async function handleDeleteProject() {
    if (!confirm(t("projects.confirmDelete"))) return
    const res = await deleteProject(projectId)
    if (res.success) router.push("/projects")
  }

  function goCreateArtifact() {
    router.push(`/forge?projectId=${projectId}`)
  }

  async function handlePublishGithub() {
    setPublishing(true)
    setPublishResult(null)
    try {
      const res = await publishProjectToGithub(projectId)
      setPublishResult(
        res.success
          ? { ok: true, message: t("projectDetail.publishSuccess") }
          : { ok: false, message: res.error || t("projectDetail.publishFailed") },
      )
      if (res.success && res.repoUrl) window.open(res.repoUrl, "_blank", "noopener,noreferrer")
    } finally {
      setPublishing(false)
    }
  }

  async function handleDeploy() {
    setDeploying(true)
    setDeployRequestError(null)
    try {
      const res = await deployProjectToNetlify(projectId)
      if (res.success) {
        await pollDeployStatus(projectId)
      } else {
        setDeployRequestError(res.error || t("projectDetail.deployRequestFailed"))
      }
    } finally {
      setDeploying(false)
    }
  }

  function handleExportZip() {
    window.open(`${API_BASE_URL}/projects/${projectId}/export.zip`, "_blank")
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
              {createElement(badgeIconComponent, { size: 26, strokeWidth: 1.25, style: { color: COLORS.accent } })}
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
            {currentProject.status === "ready" && (
              <>
                {user?.githubPublishConnected ? (
                  <button
                    type="button"
                    onClick={handlePublishGithub}
                    disabled={publishing}
                    className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-medium transition-colors disabled:opacity-50"
                    style={{ border: `1px solid ${COLORS.border}`, color: COLORS.text }}
                  >
                    {publishing ? <Loader2 size={16} className="animate-spin" /> : <GithubIcon size={16} />}
                    {t("projectDetail.publishGithub")}
                  </button>
                ) : (
                  <a
                    href={`/api/auth/github/publish/connect?returnTo=${encodeURIComponent(`/projects/${projectId}`)}`}
                    className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-medium transition-colors"
                    style={{ border: `1px solid ${COLORS.border}`, color: COLORS.text }}
                  >
                    <Link2 size={16} strokeWidth={1.75} />
                    {t("projectDetail.connectGithub")}
                  </a>
                )}
                <button
                  type="button"
                  onClick={handleDeploy}
                  disabled={deploying || currentProject.deployStatus === "deploying"}
                  className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-medium transition-colors disabled:opacity-50"
                  style={{ border: `1px solid ${COLORS.border}`, color: COLORS.text }}
                >
                  {deploying || currentProject.deployStatus === "deploying" ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Rocket size={16} strokeWidth={1.75} />
                  )}
                  {t("projectDetail.deployNetlify")}
                </button>
                <button
                  type="button"
                  onClick={handleExportZip}
                  className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-medium transition-colors"
                  style={{ border: `1px solid ${COLORS.border}`, color: COLORS.text }}
                >
                  <Download size={16} strokeWidth={1.75} />
                  {t("projectDetail.exportZip")}
                </button>
              </>
            )}
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

        {/* Status banners: генерация приложения, деплой, публикация */}
        {currentProject.status === "generating" && (
          <div
            className="mt-6 flex items-center gap-3 rounded-xl px-4 py-3"
            style={{ backgroundColor: "rgba(0,212,255,0.06)", border: `1px solid ${COLORS.accent}` }}
          >
            <Loader2 size={16} className="animate-spin" style={{ color: COLORS.accent, flexShrink: 0 }} />
            <p className="text-[13px]">{t("projectWizard.generatingApp")}</p>
          </div>
        )}
        {currentProject.status === "failed" && currentProject.generationError && (
          <div
            className="mt-6 flex items-start gap-3 rounded-xl px-4 py-3"
            style={{ backgroundColor: "rgba(248,113,113,0.06)", border: `1px solid ${COLORS.red}` }}
          >
            <AlertTriangle size={16} style={{ color: COLORS.red, flexShrink: 0, marginTop: 2 }} />
            <p className="whitespace-pre-wrap text-[13px]">{currentProject.generationError}</p>
          </div>
        )}
        {currentProject.deployStatus === "deploying" && (
          <div
            className="mt-6 flex items-center gap-3 rounded-xl px-4 py-3"
            style={{ backgroundColor: "rgba(0,212,255,0.06)", border: `1px solid ${COLORS.accent}` }}
          >
            <Loader2 size={16} className="animate-spin" style={{ color: COLORS.accent, flexShrink: 0 }} />
            <p className="text-[13px]">{t("projectDetail.deploying")}</p>
          </div>
        )}
        {currentProject.deployStatus === "deployed" && currentProject.liveUrl && (
          <div
            className="mt-6 flex items-center gap-3 rounded-xl px-4 py-3"
            style={{ backgroundColor: "rgba(74,222,128,0.06)", border: `1px solid ${COLORS.green}` }}
          >
            <CheckCircle2 size={16} style={{ color: COLORS.green, flexShrink: 0 }} />
            <span className="text-[13px]">{t("projectDetail.deployed")}</span>
            <a
              href={currentProject.liveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[13px] underline"
              style={{ color: COLORS.accent }}
            >
              {currentProject.liveUrl}
              <ExternalLink size={12} strokeWidth={1.75} />
            </a>
          </div>
        )}
        {currentProject.deployStatus === "failed" && currentProject.deployError && (
          <div
            className="mt-6 flex items-start gap-3 rounded-xl px-4 py-3"
            style={{ backgroundColor: "rgba(248,113,113,0.06)", border: `1px solid ${COLORS.red}` }}
          >
            <AlertTriangle size={16} style={{ color: COLORS.red, flexShrink: 0, marginTop: 2 }} />
            <p className="whitespace-pre-wrap text-[13px]">{currentProject.deployError}</p>
          </div>
        )}
        {deployRequestError && (
          <div
            className="mt-6 flex items-start gap-3 rounded-xl px-4 py-3"
            style={{ backgroundColor: "rgba(248,113,113,0.06)", border: `1px solid ${COLORS.red}` }}
          >
            <AlertTriangle size={16} style={{ color: COLORS.red, flexShrink: 0, marginTop: 2 }} />
            <p className="whitespace-pre-wrap text-[13px]">{deployRequestError}</p>
          </div>
        )}
        {publishResult && (
          <div
            className="mt-6 flex items-center gap-3 rounded-xl px-4 py-3"
            style={{
              backgroundColor: publishResult.ok ? "rgba(74,222,128,0.06)" : "rgba(248,113,113,0.06)",
              border: `1px solid ${publishResult.ok ? COLORS.green : COLORS.red}`,
            }}
          >
            {publishResult.ok ? (
              <CheckCircle2 size={16} style={{ color: COLORS.green, flexShrink: 0 }} />
            ) : (
              <AlertTriangle size={16} style={{ color: COLORS.red, flexShrink: 0 }} />
            )}
            <p className="text-[13px]">{publishResult.message}</p>
          </div>
        )}

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

        {/* Tabs: Артефакты / Файлы */}
        <div className="mt-10">
          <div className="flex items-center gap-1 border-b" style={{ borderColor: COLORS.border }}>
            <button
              type="button"
              onClick={() => setTab("artifacts")}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium transition-colors"
              style={{
                color: tab === "artifacts" ? COLORS.accent : COLORS.label,
                borderBottom: `2px solid ${tab === "artifacts" ? COLORS.accent : "transparent"}`,
              }}
            >
              <Boxes size={14} strokeWidth={1.75} />
              {t("projectDetail.artifactsTab")}
            </button>
            <button
              type="button"
              onClick={() => setTab("files")}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium transition-colors"
              style={{
                color: tab === "files" ? COLORS.accent : COLORS.label,
                borderBottom: `2px solid ${tab === "files" ? COLORS.accent : "transparent"}`,
              }}
            >
              <Code2 size={14} strokeWidth={1.75} />
              {t("projectDetail.filesTab")}
            </button>
          </div>

          {tab === "files" ? (
            <div className="mt-6">
              <ProjectFileEditor projectId={projectId} />
            </div>
          ) : currentProjectArtifacts.length === 0 ? (
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
