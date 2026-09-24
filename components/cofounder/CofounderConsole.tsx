"use client"

import { FormEvent, useEffect, useRef, useState } from "react"
import { FilePlus2, Radar, ShieldCheck, X } from "lucide-react"
import { MemoryLayerRail } from "@/components/design-system/MemoryLayerRail"
import { OrbitalMemory } from "@/components/design-system/OrbitalMemory"
import { PresetSwitcher } from "@/components/design-system/PresetSwitcher"
import { CinematicSequence } from "@/components/design-system/CinematicSequence"
import { track } from "@/lib/analytics"

export function CofounderConsole() {
  const [open, setOpen] = useState(false)
  const [contractName, setContractName] = useState("")
  const [brief, setBrief] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [compileResult, setCompileResult] = useState<{ score: number; review: boolean; warnings: string[] } | null>(null)
  const [compileError, setCompileError] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    if (open) dialogRef.current?.querySelector<HTMLInputElement>("input")?.focus()
  }, [open])

  async function submitContract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!contractName.trim() || !brief.trim()) return
    setSubmitting(true)
    setCompileError(null)
    const startedAt = performance.now()
    track("blueprint_compile_started", { source: "cofounder", preset: "futuristic" })
    try {
      const response = await fetch("/api/design/blueprint", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ app: contractName, brief, preset: "futuristic" }) })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data?.blueprint?.quality) throw new Error("Не удалось собрать blueprint")
      setCompileResult({ score: data.blueprint.quality.score, review: data.blueprint.quality.humanReviewRequired, warnings: data.blueprint.quality.warnings })
      track("blueprint_compile_completed", { source: "cofounder", score: data.blueprint.quality.score, humanReviewRequired: data.blueprint.quality.humanReviewRequired, durationMs: Math.round(performance.now() - startedAt) })
    } catch (error) {
      setCompileError(error instanceof Error ? error.message : "Не удалось собрать blueprint")
      track("blueprint_compile_failed", { source: "cofounder", durationMs: Math.round(performance.now() - startedAt) })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="ds-body" style={{ minHeight: "100vh", padding: "clamp(1rem, 4vw, 4rem)" }}>
      <section className="ds-hull ds-glass" style={{ padding: "clamp(1.25rem, 4vw, 3rem)", display: "flex", justifyContent: "space-between", gap: "2rem", alignItems: "end" }}>
        <div>
          <span className="ds-utility"><Radar size={14} /> AI COFOUNDER / COMMAND DECK</span>
          <h1 className="ds-display" style={{ fontSize: "clamp(2rem, 6vw, 5rem)", margin: ".5rem 0" }}>AI Cofounder</h1>
          <p style={{ color: "var(--ds-muted)" }}>Контракты продукта, доказательства и ручные согласования в одном контуре.</p>
        </div>
        <PresetSwitcher />
      </section>
      <MemoryLayerRail counts={{ Atomic: 12, Semantic: 8, Episodic: 4, Procedural: 3 }} />
      <OrbitalMemory />
      <CinematicSequence stages={[{ label: "Идея", detail: "Контекст принят", status: "complete" }, { label: "Архитектура", detail: "Собираем решение", status: "active" }, { label: "Preview", detail: "Следующий кадр готовится", status: "pending" }, { label: "Результат", detail: "Проверка человеком", status: "pending" }]} />
      <section className="ds-hull ds-glass" style={{ padding: "clamp(1.25rem, 4vw, 3rem)" }}>
        <header style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
          <div><span className="ds-utility">РАБОЧИЙ ОТСЕК</span><h2 className="ds-display">Контролируемая доставка</h2><p style={{ color: "var(--ds-muted)" }}>Ожидаемый результат, доказательства и ручное согласование в одном контуре.</p></div>
          <ShieldCheck aria-hidden="true" />
        </header>
        <button className="ds-hull ds-interactive ds-focus" style={{ marginTop: "1.5rem", padding: ".8rem 1.2rem", color: "var(--ds-ink)", background: "var(--ds-primary)", border: 0, cursor: "pointer" }} onClick={() => setOpen(true)}><FilePlus2 size={17} /> Создать контракт</button>
      </section>
      <dialog ref={dialogRef} className="ds-contract-dialog" aria-label="НОВЫЙ КОНТРАКТ" aria-labelledby="new-contract" open={open} onClose={() => setOpen(false)}>
        <button type="button" onClick={() => setOpen(false)} aria-label="Закрыть" className="ds-dialog-close"><X size={18} /></button>
        <span className="ds-utility">AI COFOUNDER / NEW DELIVERY</span>
        <h2 id="new-contract" className="ds-display">НОВЫЙ КОНТРАКТ</h2>
        <p className="ds-dialog-copy">Опишите первый продуктовый шаг. Система сохранит контекст и предложит план доставки.</p>
        <form onSubmit={submitContract}>
          <label className="ds-field">Название<input required value={contractName} onChange={(event) => setContractName(event.target.value)} placeholder="Например, кабинет партнёра" /></label>
          <label className="ds-field">Результат для проверки<textarea required rows={4} value={brief} onChange={(event) => setBrief(event.target.value)} placeholder="Какой результат должен быть готов?" /></label>
          {compileError ? <p role="alert" className="ds-dialog-error">{compileError}</p> : null}
          {compileResult ? <div className="ds-dialog-result" role="status"><strong>Blueprint готов: {compileResult.score}/100</strong><span>{compileResult.review ? "Нужна ручная проверка перед публикацией." : "Можно переходить к preview."}</span>{compileResult.warnings.length ? <small>{compileResult.warnings.length} предупреждения требуют внимания</small> : null}</div> : null}
          <div className="ds-dialog-actions">
            <button type="button" className="ds-dialog-secondary" onClick={() => setOpen(false)}>Отмена</button>
            <button type="submit" className="ds-dialog-primary" disabled={submitting}><FilePlus2 size={16} /> {submitting ? "Собираем…" : "Создать план"}</button>
          </div>
        </form>
      </dialog>
    </main>
  )
}
