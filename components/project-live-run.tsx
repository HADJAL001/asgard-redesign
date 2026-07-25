"use client"

/* ================================================================
   ProjectLiveRun — живой запуск сгенерированного приложения в браузере
   ----------------------------------------------------------------
   Монтирует файлы проекта в WebContainer (Node.js-рантайм в WASM прямо
   во вкладке), ставит зависимости, поднимает dev-сервер и показывает
   его в iframe — БЕЗ бэкенда и без деплоя. Это то самое «оно реально
   запускается», а не превью-картинка.

   Требует кросс-origin изоляции страницы (COOP/COEP) для SharedArrayBuffer
   — заголовки заданы в next.config.mjs точечно для роута /projects/:id.
   Если изоляции нет (crossOriginIsolated === false), показываем честное
   объяснение вместо тихого падения WebContainer.boot().
   ================================================================ */

import { useEffect, useState } from "react"
import { Play, Loader2, AlertTriangle, ExternalLink, RefreshCw } from "lucide-react"
import { useOsgardStore } from "@/lib/store/osgard-store"
import { COLORS } from "@/lib/economy"
import { useTranslation } from "@/lib/i18n/use-translation"
import { runInWebContainer } from "@/lib/integrations/webcontainer"

type Props = {
  projectId: number
}

type RunState = "idle" | "booting" | "installing" | "ready" | "error"

export function ProjectLiveRun({ projectId }: Props) {
  const { t } = useTranslation()
  const { currentProjectFiles, fetchProjectFiles } = useOsgardStore()

  const [state, setState] = useState<RunState>("idle")
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isolated, setIsolated] = useState<boolean | null>(null)

  useEffect(() => {
    fetchProjectFiles(projectId, { skipAuthRedirect: true })
    // crossOriginIsolated доступен только в браузере после гидратации.
    Promise.resolve().then(() => setIsolated(typeof window !== "undefined" ? window.crossOriginIsolated === true : null))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  async function handleRun() {
    if (currentProjectFiles.length === 0) return
    setState("booting")
    setErrorMsg(null)
    setPreviewUrl(null)
    try {
      setState("installing")
      const url = await runInWebContainer(
        currentProjectFiles.map((f) => ({ path: f.path, content: f.content })),
      )
      setPreviewUrl(url)
      setState("ready")
    } catch (err: any) {
      setErrorMsg(err?.message || t("projectDetail.liveRunFailed"))
      setState("error")
    }
  }

  // Страница без кросс-origin изоляции — WebContainer не сможет стартовать.
  if (isolated === false) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl px-6 py-14 text-center" style={{ backgroundColor: COLORS.card, border: `1px dashed ${COLORS.border}` }}>
        <AlertTriangle size={28} strokeWidth={1.25} style={{ color: COLORS.amber }} />
        <p className="max-w-[440px] text-[13px]" style={{ color: COLORS.label }}>
          {t("projectDetail.liveRunNoIsolation")}
        </p>
      </div>
    )
  }

  const busy = state === "booting" || state === "installing"

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px]" style={{ color: COLORS.label }}>
          {t("projectDetail.liveRunHint")}
        </p>
        <div className="flex items-center gap-2">
          {previewUrl && (
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-medium transition-colors"
              style={{ border: `1px solid ${COLORS.border}`, color: COLORS.text }}
            >
              <ExternalLink size={14} strokeWidth={1.75} />
              {t("projectDetail.liveRunOpenTab")}
            </a>
          )}
          <button
            type="button"
            onClick={handleRun}
            disabled={busy || currentProjectFiles.length === 0}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-medium transition-opacity hover:opacity-90 disabled:opacity-40"
            style={{ backgroundColor: COLORS.accent, color: COLORS.bg }}
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : state === "ready" ? <RefreshCw size={15} strokeWidth={1.75} /> : <Play size={15} strokeWidth={1.75} />}
            {state === "ready" ? t("projectDetail.liveRunRestart") : t("projectDetail.liveRunStart")}
          </button>
        </div>
      </div>

      {busy && (
        <div className="flex items-center gap-3 rounded-xl px-4 py-3" style={{ backgroundColor: "rgba(0,212,255,0.06)", border: `1px solid ${COLORS.accent}` }}>
          <Loader2 size={16} className="animate-spin" style={{ color: COLORS.accent, flexShrink: 0 }} />
          <p className="text-[13px]">
            {state === "booting" ? t("projectDetail.liveRunBooting") : t("projectDetail.liveRunInstalling")}
          </p>
        </div>
      )}

      {state === "error" && errorMsg && (
        <div className="flex items-start gap-3 rounded-xl px-4 py-3" style={{ backgroundColor: "rgba(248,113,113,0.06)", border: `1px solid ${COLORS.red}` }}>
          <AlertTriangle size={16} style={{ color: COLORS.red, flexShrink: 0, marginTop: 2 }} />
          <p className="whitespace-pre-wrap text-[13px]">{errorMsg}</p>
        </div>
      )}

      {previewUrl && (
        <div className="overflow-hidden rounded-2xl" style={{ border: `1px solid ${COLORS.border}` }}>
          <iframe
            src={previewUrl}
            title={t("projectDetail.liveRunTab")}
            className="h-[560px] w-full bg-white"
            sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups"
          />
        </div>
      )}
    </div>
  )
}
