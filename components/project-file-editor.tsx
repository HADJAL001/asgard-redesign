"use client"

/* ================================================================
   ProjectFileEditor — Monaco-редактор файлов сгенерированного приложения
   ----------------------------------------------------------------
   Использует useOsgardStore() (lib/store/osgard-store.tsx):
   - fetchProjectFiles(id) → GET /projects/:id/files
   - saveProjectFile(id, path, content) → PUT /projects/:id/files/*

   Слева — список файлов проекта, справа — Monaco-редактор выбранного
   файла. Сохранение по кнопке или Ctrl/Cmd+S; после сохранения
   backend ре-валидирует ВСЕ файлы проекта через tsc — ошибки (если
   есть) показываются под редактором, но не блокируют сохранение.
   ================================================================ */

import { useEffect, useMemo, useState } from "react"
import Editor from "@monaco-editor/react"
import { FileCode2, Save, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react"
import { useOsgardStore } from "@/lib/store/osgard-store"
import { COLORS } from "@/lib/economy"
import { useTranslation } from "@/lib/i18n/use-translation"

type Props = {
  projectId: number
}

function languageForPath(path: string): string {
  if (path.endsWith(".tsx") || path.endsWith(".ts")) return "typescript"
  if (path.endsWith(".jsx") || path.endsWith(".js")) return "javascript"
  if (path.endsWith(".json")) return "json"
  if (path.endsWith(".css")) return "css"
  if (path.endsWith(".md")) return "markdown"
  return "plaintext"
}

export function ProjectFileEditor({ projectId }: Props) {
  const { t } = useTranslation()
  const { currentProjectFiles, fetchProjectFiles, saveProjectFile } = useOsgardStore()

  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [draft, setDraft] = useState("")
  const [loadingFiles, setLoadingFiles] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveErrors, setSaveErrors] = useState<string[]>([])
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [saveFailure, setSaveFailure] = useState<string | null>(null)

  useEffect(() => {
    setLoadingFiles(true)
    fetchProjectFiles(projectId, { skipAuthRedirect: true }).finally(() => setLoadingFiles(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  useEffect(() => {
    if (currentProjectFiles.length === 0) {
      setSelectedPath(null)
      return
    }
    if (!selectedPath || !currentProjectFiles.some((f) => f.path === selectedPath)) {
      setSelectedPath(currentProjectFiles[0].path)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProjectFiles])

  const selectedFile = useMemo(
    () => currentProjectFiles.find((f) => f.path === selectedPath) || null,
    [currentProjectFiles, selectedPath],
  )

  useEffect(() => {
    setDraft(selectedFile?.content ?? "")
    setSaveErrors([])
    setSavedAt(null)
    setSaveFailure(null)
  }, [selectedFile?.path])

  const dirty = selectedFile !== null && draft !== selectedFile.content

  function selectFile(path: string) {
    if (path === selectedPath) return
    if (dirty && !confirm(t("projectDetail.confirmDiscardChanges"))) return
    setSelectedPath(path)
  }

  async function handleSave() {
    if (!selectedFile || !dirty || saving) return
    setSaving(true)
    setSaveFailure(null)
    try {
      const res = await saveProjectFile(projectId, selectedFile.path, draft)
      if (res.success) {
        setSaveErrors(res.errors || [])
        setSavedAt(Date.now())
      } else {
        setSaveFailure(res.error || t("projectDetail.saveFileFailed"))
      }
    } finally {
      setSaving(false)
    }
  }

  if (loadingFiles) {
    return (
      <div className="flex items-center justify-center gap-3 rounded-2xl px-6 py-16" style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}>
        <Loader2 size={20} className="animate-spin" style={{ color: COLORS.accent }} />
        <p className="text-[14px]" style={{ color: COLORS.label }}>{t("projectDetail.filesLoading")}</p>
      </div>
    )
  }

  if (currentProjectFiles.length === 0) {
    return (
      <div className="rounded-2xl px-6 py-16 text-center" style={{ backgroundColor: COLORS.card, border: `1px dashed ${COLORS.border}` }}>
        <p className="text-[14px]" style={{ color: COLORS.label }}>{t("projectDetail.noFiles")}</p>
      </div>
    )
  }

  return (
    <div
      className="grid grid-cols-1 overflow-hidden rounded-2xl md:grid-cols-[220px_1fr]"
      style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "s") {
          e.preventDefault()
          handleSave()
        }
      }}
    >
      {/* Список файлов */}
      <div className="max-h-[520px] overflow-y-auto border-b md:border-b-0 md:border-r" style={{ borderColor: COLORS.border }}>
        {currentProjectFiles.map((f) => {
          const active = f.path === selectedPath
          return (
            <button
              key={f.path}
              type="button"
              onClick={() => selectFile(f.path)}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[12px] transition-colors"
              style={{
                color: active ? COLORS.accent : COLORS.text,
                backgroundColor: active ? "rgba(0,212,255,0.08)" : "transparent",
              }}
            >
              <FileCode2 size={14} strokeWidth={1.5} style={{ flexShrink: 0, color: active ? COLORS.accent : COLORS.label }} />
              <span className="truncate">{f.path}</span>
            </button>
          )
        })}
      </div>

      {/* Редактор */}
      <div className="flex flex-col">
        <div className="flex items-center justify-between gap-3 px-4 py-2.5" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
          <span className="truncate text-[12px]" style={{ color: COLORS.label }}>{selectedFile?.path}</span>
          <div className="flex items-center gap-3">
            {!saving && savedAt && !dirty && saveErrors.length === 0 && (
              <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: COLORS.green }}>
                <CheckCircle2 size={13} strokeWidth={1.75} />
                {t("projectDetail.fileSaved")}
              </span>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={!dirty || saving}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-opacity disabled:opacity-40"
              style={{ backgroundColor: COLORS.accent, color: COLORS.bg }}
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} strokeWidth={1.75} />}
              {t("projectDetail.saveFile")}
            </button>
          </div>
        </div>

        <div className="h-[440px]">
          {selectedFile && (
            <Editor
              key={selectedFile.path}
              height="100%"
              theme="vs-dark"
              language={languageForPath(selectedFile.path)}
              value={draft}
              onChange={(value) => setDraft(value ?? "")}
              options={{ minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false }}
            />
          )}
        </div>

        {saveFailure && (
          <div className="flex items-start gap-2 px-4 py-3 text-[12px]" style={{ borderTop: `1px solid ${COLORS.border}`, color: COLORS.red }}>
            <AlertTriangle size={14} strokeWidth={1.75} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{saveFailure}</span>
          </div>
        )}

        {saveErrors.length > 0 && (
          <div className="flex items-start gap-2 px-4 py-3 text-[12px]" style={{ borderTop: `1px solid ${COLORS.border}`, color: COLORS.amber }}>
            <AlertTriangle size={14} strokeWidth={1.75} style={{ flexShrink: 0, marginTop: 1 }} />
            <pre className="whitespace-pre-wrap font-sans">{saveErrors.join("\n")}</pre>
          </div>
        )}
      </div>
    </div>
  )
}
