"use client"

/* ================================================================
   OSGARD · GuestCodeStudio — гостевая студия создания проекта
   ----------------------------------------------------------------
   Компонует форму → статус генерации → Monaco-вьюер → живой
   предпросмотр (WebContainer). Точка входа Part 2 плана.

   НЕ смонтирована в eternity-landing.tsx (тот в работе у сессии A).
   Экран принимает идею проекта и показывает созданный результат.

   Backend анонимного пайплайна делает сессия A. Пока API нет,
   useGuestCodeGeneration (DEFAULT_ADAPTER) честно показывает статус
   «недоступно» — без фейковых файлов. Когда контракт подтверждён,
   реальный адаптер подставляется одной правкой (пропом `adapter`).
   ================================================================ */

import { useState } from "react"
import { Download, Loader2, RefreshCw, Sparkles, Info } from "lucide-react"
import {
  useGuestCodeGeneration,
  type GuestCodeAdapter,
} from "@/hooks/useGuestCodeGeneration"
import { GuestCodeViewer } from "./GuestCodeViewer"
import { GuestLivePreview } from "./GuestLivePreview"

type Tab = "code" | "preview"

export function GuestCodeStudio({ adapter }: { adapter?: GuestCodeAdapter }) {
  const { phase, progress, result, error, canResume, isBusy, generate, resume, reset } = useGuestCodeGeneration(adapter)
  const [name, setName] = useState("")
  const [hint, setHint] = useState("")
  const [tab, setTab] = useState<Tab>("code")

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || isBusy) return
    generate({ name: name.trim(), hint: hint.trim() || undefined })
  }

  const files = result?.files ?? []

  return (
    <section
      aria-label="Создание проекта из идеи"
      style={{ maxWidth: 960, margin: "0 auto", width: "100%", padding: "48px 24px", boxSizing: "border-box" }}
    >
      <h2 style={{ fontSize: 26, fontWeight: 700, margin: "0 0 6px" }}>Создайте проект из идеи</h2>
      <p style={{ opacity: 0.6, margin: "0 0 24px", fontSize: 15 }}>
        Опишите замысел, а OSGARD подготовит структуру проекта, рабочие файлы и первый результат для проверки.
      </p>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Название проекта, например: «Лендинг для кофейни»"
          aria-label="Название проекта"
          disabled={isBusy}
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "12px 14px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.15)",
            background: "rgba(255,255,255,0.03)",
            color: "#fff",
            fontSize: 14,
          }}
        />
        <textarea
          value={hint}
          onChange={(e) => setHint(e.target.value)}
          placeholder="Что должен делать проект? Добавьте функции, аудиторию и желаемый стиль"
          aria-label="Описание проекта"
          disabled={isBusy}
          rows={3}
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "12px 14px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.15)",
            background: "rgba(255,255,255,0.03)",
            color: "#fff",
            fontSize: 14,
            resize: "vertical",
          }}
        />
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="submit"
            disabled={!name.trim() || isBusy}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 20px",
              borderRadius: 10,
              border: "none",
              background: !name.trim() || isBusy ? "rgba(0,212,255,0.4)" : "#00D4FF",
              color: "#0A0A0F",
              fontWeight: 600,
              fontSize: 14,
              cursor: !name.trim() || isBusy ? "not-allowed" : "pointer",
            }}
          >
            {isBusy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {isBusy ? "Создаю проект…" : "Создать проект"}
          </button>
          {(phase === "done" || phase === "error" || phase === "unavailable") && (
            <button
              type="button"
              onClick={reset}
              style={{
                padding: "10px 20px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.2)",
                background: "transparent",
                color: "#fff",
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Заново
            </button>
          )}
        </div>
      </form>

      {/* Статус */}
      {isBusy && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, opacity: 0.8, marginBottom: 16 }}>
          <Loader2 size={16} className="animate-spin" />
          <span>
            {progress?.message || progress?.stage || "Готовлю проект…"}
            {typeof progress?.pct === "number" ? ` (${Math.round(progress.pct)}%)` : ""}
          </span>
        </div>
      )}

      {phase === "unavailable" && (
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            padding: 16,
            borderRadius: 12,
            border: "1px solid rgba(0,212,255,0.3)",
            background: "rgba(0,212,255,0.06)",
            fontSize: 14,
          }}
        >
          <Info size={18} color="#00D4FF" style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <strong>Живая генерация кода скоро подключится.</strong>
            <div style={{ opacity: 0.75, marginTop: 4 }}>
              {error || "Мы дорабатываем анонимный пайплайн. Пока можно попробовать демо-вселенную выше."}
            </div>
          </div>
        </div>
      )}

      {phase === "error" && (
        <div
          style={{
            padding: 16,
            borderRadius: 12,
            border: canResume ? "1px solid rgba(251,191,36,0.4)" : "1px solid rgba(248,113,113,0.4)",
            background: canResume ? "rgba(251,191,36,0.08)" : "rgba(248,113,113,0.08)",
            fontSize: 14,
          }}
        >
          <div>{error || "Что-то пошло не так при генерации."}</div>
          {canResume ? (
            <button
              type="button"
              onClick={resume}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                marginTop: 12,
                minHeight: 36,
                padding: "7px 12px",
                borderRadius: 7,
                border: "1px solid rgba(251,191,36,0.5)",
                background: "rgba(251,191,36,0.1)",
                color: "#FCD34D",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <RefreshCw size={15} aria-hidden="true" />
              Продолжить проверку
            </button>
          ) : null}
        </div>
      )}

      {/* Результат */}
      {phase === "done" && files.length > 0 && (
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          <div role="tablist" aria-label="Режим результата" style={{ display: "flex", gap: 8 }}>
            {(["code", "preview"] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                role="tab"
                aria-selected={tab === t}
                aria-controls={`guest-studio-panel-${t}`}
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.15)",
                  background: tab === t ? "rgba(0,212,255,0.12)" : "transparent",
                  color: tab === t ? "#00D4FF" : "rgba(255,255,255,0.7)",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {t === "code" ? "Код" : "Превью"}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ color: result?.source === "ai" ? "#7CFFB2" : "#A8B7CA", fontSize: 12 }}>
              {result?.source === "ai" ? "Собрано AI-командой" : "Собрано резервным генератором"}
            </span>
            {result?.taskId ? (
              <a
                href={`/api/demo/code/${encodeURIComponent(result.taskId)}/archive.zip`}
                download
                aria-label="Скачать весь проект ZIP-архивом"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  minHeight: 34,
                  padding: "6px 11px",
                  border: "1px solid rgba(124,255,178,0.35)",
                  borderRadius: 7,
                  color: "#7CFFB2",
                  fontSize: 12,
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                <Download size={15} aria-hidden="true" />
                Скачать ZIP
              </a>
            ) : null}
          </div>
          </div>

          <div id={`guest-studio-panel-${tab}`} role="tabpanel" aria-label={tab === "code" ? "Код проекта" : "Предпросмотр проекта"}>
            {tab === "code" ? <GuestCodeViewer files={files} /> : <GuestLivePreview key={files.map((file) => `${file.path}:${file.content.length}`).join("|")} files={files} />}
          </div>
        </div>
      )}

      {phase === "done" && files.length === 0 && (
        <div style={{ opacity: 0.6, fontSize: 14 }}>Генерация завершилась, но файлы не пришли.</div>
      )}
    </section>
  )
}

export default GuestCodeStudio
