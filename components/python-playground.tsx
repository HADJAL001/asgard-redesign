"use client"

/* ================================================================
   PythonPlayground — реальный запуск Python в браузере через Pyodide
   ----------------------------------------------------------------
   Pyodide — CPython, скомпилированный в WebAssembly. Грузится с
   официального CDN (jsdelivr) один раз, дальше код исполняется прямо
   во вкладке, без сервера. Это выполняет требование «языки
   программирования реально запускаются», а не имитируются: рядом с
   Node/Next (WebContainer) добавлен настоящий Python.

   stdout/stderr перехватываются через sys.stdout/sys.stderr → JS.
   ================================================================ */

import { useEffect, useRef, useState } from "react"
import Editor from "@monaco-editor/react"
import { Play, Loader2, Terminal, Trash2 } from "lucide-react"
import { Navbar } from "./navbar"
import { COLORS } from "@/lib/economy"
import { useTranslation } from "@/lib/i18n/use-translation"

const PYODIDE_VERSION = "0.26.4"
const PYODIDE_CDN = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full`

declare global {
  interface Window {
    loadPyodide?: (config: { indexURL: string }) => Promise<any>
  }
}

const DEFAULT_CODE = `# Python реально исполняется в браузере (Pyodide / CPython в WASM)
import sys
print("Python", sys.version.split()[0])

def fib(n):
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a

print("Первые 10 чисел Фибоначчи:", [fib(i) for i in range(10)])
`

function loadPyodideScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.loadPyodide) return resolve()
    const existing = document.querySelector<HTMLScriptElement>(`script[data-pyodide]`)
    if (existing) {
      existing.addEventListener("load", () => resolve())
      existing.addEventListener("error", () => reject(new Error("Не удалось загрузить Pyodide")))
      return
    }
    const script = document.createElement("script")
    script.src = `${PYODIDE_CDN}/pyodide.js`
    script.async = true
    script.dataset.pyodide = "1"
    script.onload = () => resolve()
    script.onerror = () => reject(new Error("Не удалось загрузить Pyodide с CDN"))
    document.head.appendChild(script)
  })
}

export function PythonPlayground() {
  const { t } = useTranslation()
  const [code, setCode] = useState(DEFAULT_CODE)
  const [output, setOutput] = useState<string>("")
  const [loadingRuntime, setLoadingRuntime] = useState(false)
  const [running, setRunning] = useState(false)
  const [ready, setReady] = useState(false)
  const pyodideRef = useRef<any>(null)

  async function ensurePyodide(): Promise<any> {
    if (pyodideRef.current) return pyodideRef.current
    setLoadingRuntime(true)
    try {
      await loadPyodideScript()
      const pyodide = await window.loadPyodide!({ indexURL: `${PYODIDE_CDN}/` })
      pyodideRef.current = pyodide
      setReady(true)
      return pyodide
    } finally {
      setLoadingRuntime(false)
    }
  }

  // Прогреваем рантайм при первом заходе (загрузка ~10МБ WASM идёт в фоне).
  useEffect(() => {
    ensurePyodide().catch((err) => setOutput(`⚠️ ${err?.message || "Ошибка загрузки Pyodide"}`))
  }, [])

  async function handleRun() {
    if (running) return
    setRunning(true)
    setOutput("")
    try {
      const pyodide = await ensurePyodide()
      // Перенаправляем stdout/stderr в буфер, который заберём после выполнения.
      pyodide.runPython(`
import sys, io
_osgard_buf = io.StringIO()
sys.stdout = _osgard_buf
sys.stderr = _osgard_buf
`)
      let errText = ""
      try {
        await pyodide.runPythonAsync(code)
      } catch (err: any) {
        // Питоновский трейсбек приходит как сообщение ошибки JS — показываем как есть.
        errText = String(err?.message || err)
      }
      const captured = (pyodide.runPython("_osgard_buf.getvalue()") as string) || ""
      setOutput([captured, errText].filter(Boolean).join("\n"))
    } catch (err: any) {
      setOutput(`⚠️ ${err?.message || "Ошибка выполнения"}`)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="min-h-screen font-sans" style={{ background: "linear-gradient(180deg, #0A0A0F 0%, #14141E 100%)", color: COLORS.text }}>
      <Navbar />
      <main className="mx-auto max-w-[1240px] px-6 py-10 md:px-10 md:py-12">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-[24px] font-semibold">{t("playground.pythonTitle")}</h1>
            <p className="mt-1 text-[14px]" style={{ color: COLORS.label }}>{t("playground.pythonHint")}</p>
          </div>
          <div className="flex items-center gap-2">
            {loadingRuntime && (
              <span className="inline-flex items-center gap-1.5 text-[12px]" style={{ color: COLORS.label }}>
                <Loader2 size={14} className="animate-spin" />
                {t("playground.loadingRuntime")}
              </span>
            )}
            <button
              type="button"
              onClick={handleRun}
              disabled={running || loadingRuntime}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-medium transition-opacity hover:opacity-90 disabled:opacity-40"
              style={{ backgroundColor: COLORS.accent, color: COLORS.bg }}
            >
              {running ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} strokeWidth={1.75} />}
              {t("playground.run")}
            </button>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="overflow-hidden rounded-2xl" style={{ border: `1px solid ${COLORS.border}` }}>
            <div className="px-4 py-2.5 text-[12px]" style={{ borderBottom: `1px solid ${COLORS.border}`, color: COLORS.label }}>
              main.py
            </div>
            <div className="h-[460px]">
              <Editor
                height="100%"
                theme="vs-dark"
                language="python"
                value={code}
                onChange={(v) => setCode(v ?? "")}
                options={{ minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false }}
              />
            </div>
          </div>

          <div className="flex flex-col overflow-hidden rounded-2xl" style={{ border: `1px solid ${COLORS.border}`, backgroundColor: "#0B0B12" }}>
            <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
              <span className="inline-flex items-center gap-1.5 text-[12px]" style={{ color: COLORS.label }}>
                <Terminal size={13} strokeWidth={1.75} />
                {t("playground.output")}
              </span>
              <button
                type="button"
                onClick={() => setOutput("")}
                className="inline-flex items-center gap-1 text-[11px] transition-colors"
                style={{ color: COLORS.label }}
              >
                <Trash2 size={12} strokeWidth={1.75} />
                {t("playground.clear")}
              </button>
            </div>
            <pre className="h-[460px] overflow-auto whitespace-pre-wrap p-4 font-mono text-[12px]" style={{ color: ready ? COLORS.text : COLORS.label }}>
              {output || (ready ? t("playground.outputEmpty") : t("playground.loadingRuntime"))}
            </pre>
          </div>
        </div>
      </main>
    </div>
  )
}
