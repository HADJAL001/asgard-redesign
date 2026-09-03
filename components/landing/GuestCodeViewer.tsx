"use client"

/* ================================================================
   OSGARD · GuestCodeViewer — лёгкий Monaco-вьюер для гостевой студии
   ----------------------------------------------------------------
   Принимает files: {path, content}[] пропом напрямую и показывает
   дерево файлов + Monaco на выбранном. СОЗНАТЕЛЬНО не переиспользует
   project-file-editor.tsx — тот жёстко завязан на useOsgardStore()
   (авторизованный флоу). Здесь состояние локальное, без стора.

   Monaco грузится динамически (ssr:false) — тяжёлый клиентский бандл.
   ================================================================ */

import { useMemo, useState } from "react"
import dynamic from "next/dynamic"
import { Check, Copy, Download } from "lucide-react"
import type { FileTree } from "@/lib/integrations/file-tree"

const MonacoEditor = dynamic(() => import("@monaco-editor/react").then((m) => m.default), {
  ssr: false,
  loading: () => <div style={{ padding: 16, opacity: 0.6, fontSize: 13 }}>Загрузка редактора…</div>,
})

function languageFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase()
  switch (ext) {
    case "ts":
    case "tsx":
      return "typescript"
    case "js":
    case "jsx":
    case "mjs":
      return "javascript"
    case "json":
      return "json"
    case "css":
      return "css"
    case "scss":
      return "scss"
    case "html":
      return "html"
    case "md":
      return "markdown"
    case "py":
      return "python"
    default:
      return "plaintext"
  }
}

export function GuestCodeViewer({ files }: { files: FileTree }) {
  const sorted = useMemo(() => [...files].sort((a, b) => a.path.localeCompare(b.path)), [files])
  const [activePath, setActivePath] = useState<string | null>(sorted[0]?.path ?? null)
  const [copied, setCopied] = useState(false)

  const active = sorted.find((f) => f.path === activePath) ?? sorted[0] ?? null

  async function copyActiveFile() {
    if (!active || !navigator.clipboard) return
    try {
      await navigator.clipboard.writeText(active.content)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  function downloadActiveFile() {
    if (!active) return
    const blob = new Blob([active.content], { type: "text/plain;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = active.path.split("/").pop() || "project-file.txt"
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  if (sorted.length === 0) {
    return (
      <div style={{ padding: 24, opacity: 0.6, fontSize: 14 }}>Нет файлов для отображения.</div>
    )
  }

  return (
    <div className="guest-code-viewer" style={{ display: "flex", minHeight: 420, border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, overflow: "hidden" }}>
      {/* Дерево файлов */}
      <div
        style={{
          flex: "0 0 200px",
          borderRight: "1px solid rgba(255,255,255,0.1)",
          overflowY: "auto",
          background: "rgba(10,10,15,0.5)",
        }}
      >
        {sorted.map((f) => {
          const isActive = f.path === active?.path
          return (
            <button
              key={f.path}
              type="button"
              onClick={() => setActivePath(f.path)}
              title={f.path}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "8px 12px",
                fontSize: 12,
                fontFamily: "monospace",
                border: "none",
                borderLeft: isActive ? "2px solid #00D4FF" : "2px solid transparent",
                background: isActive ? "rgba(0,212,255,0.08)" : "transparent",
                color: isActive ? "#00D4FF" : "rgba(255,255,255,0.7)",
                cursor: "pointer",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {f.path}
            </button>
          )
        })}
      </div>

      {/* Редактор */}
      <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
        <button
          type="button"
          onClick={copyActiveFile}
          disabled={!active || !navigator.clipboard}
          aria-label={copied ? "Код скопирован" : "Скопировать код файла"}
          title={copied ? "Скопировано" : "Скопировать файл"}
          style={{ position: "absolute", zIndex: 2, top: 8, right: 10, display: "grid", placeItems: "center", width: 30, height: 30, border: "1px solid rgba(255,255,255,0.16)", borderRadius: 7, background: "rgba(10,10,15,0.82)", color: copied ? "#7CFFB2" : "#B9C8DA", cursor: "pointer" }}
        >
          {copied ? <Check size={15} /> : <Copy size={15} />}
        </button>
        <button
          type="button"
          onClick={downloadActiveFile}
          disabled={!active}
          aria-label="Скачать выбранный файл"
          title="Скачать файл"
          style={{ position: "absolute", zIndex: 2, top: 8, right: 48, display: "grid", placeItems: "center", width: 30, height: 30, border: "1px solid rgba(255,255,255,0.16)", borderRadius: 7, background: "rgba(10,10,15,0.82)", color: "#B9C8DA", cursor: "pointer" }}
        >
          <Download size={15} />
        </button>
        {active && (
          <MonacoEditor
            height="100%"
            theme="vs-dark"
            path={active.path}
            language={languageFromPath(active.path)}
            value={active.content}
            options={{
              readOnly: true,
              minimap: { enabled: false },
              fontSize: 13,
              scrollBeyondLastLine: false,
              wordWrap: "on",
            }}
          />
        )}
      </div>
      <style>{`@media (max-width: 640px) { .guest-code-viewer { flex-direction: column; min-height: 0 !important; } .guest-code-viewer > div:first-child { flex: 0 0 auto !important; max-height: 148px; border-right: 0 !important; border-bottom: 1px solid rgba(255,255,255,0.1); } .guest-code-viewer > div:last-child { height: 360px; } }`}</style>
    </div>
  )
}

export default GuestCodeViewer
