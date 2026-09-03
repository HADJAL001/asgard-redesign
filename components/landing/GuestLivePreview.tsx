"use client"

/* ================================================================
   OSGARD · GuestLivePreview — живой предпросмотр в WebContainer
   ----------------------------------------------------------------
   Зовёт уже существующий (но нигде не подключённый) адаптер
   lib/integrations/webcontainer.ts::runInWebContainer — клиентский
   WASM-Node поднимает dev-сервер и отдаёт previewUrl, рендерим в
   <iframe>.

   ТРЕБОВАНИЕ ОКРУЖЕНИЯ: работает только на роуте с COOP/COEP-
   заголовками (SharedArrayBuffer). Их добавляет next.config.mjs через
   headers() СТРОГО для роута гостевой студии — координируется с
   сессией A при мерже (та тоже правит head() под свой Live Run).
   Пока заголовков нет — boot упадёт, и мы честно покажем ошибку, а
   не притворимся, что превью работает.
   ================================================================ */

import { useRef, useState } from "react"
import { Loader2, Play, AlertTriangle } from "lucide-react"
import type { FileTree } from "@/lib/integrations/file-tree"
import { runInWebContainer } from "@/lib/integrations/webcontainer"
import { captureError } from "@/lib/sentry-client"

type PreviewState = "idle" | "booting" | "ready" | "error"

export function GuestLivePreview({ files }: { files: FileTree }) {
  const [state, setState] = useState<PreviewState>("idle")
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const runIdRef = useRef(0)

  async function handleRun() {
    const runId = ++runIdRef.current
    setState("booting")
    setError(null)
    setPreviewUrl(null)
    try {
      const url = await runInWebContainer(files)
      if (runId !== runIdRef.current) return
      setPreviewUrl(url)
      setState("ready")
    } catch (err) {
      if (runId !== runIdRef.current) return
      captureError("[GuestLivePreview] runInWebContainer", err)
      setError(err instanceof Error ? err.message : "Не удалось поднять превью")
      setState("error")
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={handleRun}
          disabled={state === "booting" || files.length === 0}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 16px",
            borderRadius: 10,
            border: "none",
            background: state === "booting" ? "rgba(0,212,255,0.4)" : "#00D4FF",
            color: "#0A0A0F",
            fontWeight: 600,
            fontSize: 13,
            cursor: state === "booting" ? "wait" : "pointer",
          }}
        >
          {state === "booting" ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
          {state === "booting" ? "Поднимаю превью…" : "Запустить превью"}
        </button>
        {state === "booting" && (
          <span style={{ fontSize: 12, opacity: 0.6 }}>
            Первый запуск ставит зависимости в браузере — это может занять до минуты.
          </span>
        )}
      </div>

      {state === "error" && error && (
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            padding: 12,
            borderRadius: 10,
            border: "1px solid rgba(248,113,113,0.4)",
            background: "rgba(248,113,113,0.08)",
            fontSize: 13,
          }}
        >
          <AlertTriangle size={16} color="#F87171" style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{error}</span>
        </div>
      )}

      {state === "ready" && previewUrl && (
        <iframe
          src={previewUrl}
          title="Живой предпросмотр"
          style={{
            width: "100%",
            aspectRatio: "16 / 10",
            minHeight: 280,
            maxHeight: 560,
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 12,
            background: "#fff",
          }}
        />
      )}
    </div>
  )
}

export default GuestLivePreview
