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

  const active = sorted.find((f) => f.path === activePath) ?? sorted[0] ?? null

  if (sorted.length === 0) {
    return (
      <div style={{ padding: 24, opacity: 0.6, fontSize: 14 }}>Нет файлов для отображения.</div>
    )
  }

  return (
    <div style={{ display: "flex", height: 420, border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, overflow: "hidden" }}>
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
      <div style={{ flex: 1, minWidth: 0 }}>
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
    </div>
  )
}

export default GuestCodeViewer
