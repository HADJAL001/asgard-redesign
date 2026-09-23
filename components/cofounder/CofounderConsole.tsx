"use client"

import { useState } from "react"
import { FilePlus2, Radar, ShieldCheck, X } from "lucide-react"
import { MemoryLayerRail } from "@/components/design-system/MemoryLayerRail"
import { PresetSwitcher } from "@/components/design-system/PresetSwitcher"

export function CofounderConsole() {
  const [open, setOpen] = useState(false)
  return <main className="ds-body" style={{ minHeight: "100vh", padding: "clamp(1rem, 4vw, 4rem)" }}>
    <section className="ds-hull ds-glass" style={{ padding: "clamp(1.25rem, 4vw, 3rem)", display: "flex", justifyContent: "space-between", gap: "2rem", alignItems: "end" }}>
      <div><span className="ds-utility"><Radar size={14} /> AI COFOUNDER / COMMAND DECK</span><h1 className="ds-display" style={{ fontSize: "clamp(2rem, 6vw, 5rem)", margin: ".5rem 0" }}>AI Cofounder</h1><p style={{ color: "var(--ds-muted)" }}>Контракты продукта, доказательства и ручные согласования в одном контуре.</p></div><PresetSwitcher />
    </section>
    <MemoryLayerRail counts={{ Atomic: 12, Semantic: 8, Episodic: 4, Procedural: 3 }} />
    <section className="ds-hull ds-glass" style={{ padding: "clamp(1.25rem, 4vw, 3rem)" }}><header style={{ display: "flex", justifyContent: "space-between" }}><div><span className="ds-utility">РАБОЧИЙ ОТСЕК</span><h2 className="ds-display">Контролируемая доставка</h2><p style={{ color: "var(--ds-muted)" }}>Ожидаемый результат, доказательства и ручное согласование в одном контуре.</p></div><ShieldCheck aria-hidden="true" /></header><button className="ds-hull ds-interactive ds-focus" style={{ marginTop: "1.5rem", padding: ".8rem 1.2rem", color: "var(--ds-ink)", background: "var(--ds-primary)", border: 0, cursor: "pointer" }} onClick={() => setOpen(true)}><FilePlus2 size={17} /> Создать контракт</button></section>
    <dialog aria-label=" НОВЫЙ КОНТРАКТ open={open} onClose={() => setOpen(false)} style={{ background: "var(--ds-surface)", color: "var(--ds-ink)", border: "1px solid var(--ds-line)", padding: "2rem" }}><button onClick={() => setOpen(false)} aria-label="Закрыть" style={{ float: "right", background: "transparent", color: "inherit", border: 0 }}><X /></button><h2 id="new-contract" className="ds-display">НОВЫЙ КОНТРАКТ</h2><label>Название<input style={{ display: "block", margin: ".5rem 0 1rem", width: "100%" }} placeholder="Например, кабинет партнёра" /></label><label>Результат для проверки<textarea style={{ display: "block", marginTop: ".5rem", width: "100%" }} rows={4} /></label></dialog>
  </main>
}
