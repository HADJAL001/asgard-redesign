"use client"

import { FormEvent, useEffect, useRef, useState } from "react"
import { FilePlus2, Radar, ShieldCheck, X } from "lucide-react"
import { MemoryLayerRail } from "@/components/design-system/MemoryLayerRail"
import { OrbitalMemory } from "@/components/design-system/OrbitalMemory"
import { PresetSwitcher } from "@/components/design-system/PresetSwitcher"

export function CofounderConsole() {
  const [open, setOpen] = useState(false)
  const [contractName, setContractName] = useState("")
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    if (open) dialogRef.current?.querySelector<HTMLInputElement>("input")?.focus()
  }, [open])

  function submitContract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!contractName.trim()) return
    setOpen(false)
    setContractName("")
  }

  return (
    <main className="ds-body" style={{ minHeight: "100vh", padding: "clamp(1rem, 4vw, 4rem)" }}>
      <section className="ds-hull ds-glass" style={{ padding: "clamp(1.25rem, 4vw, 3rem)", display: "flex", justifyContent: "space-between", gap: "2rem", alignItems: "end" }}>
        <div>
          <span className="ds-utility"><Radar size={14} /> AI COFOUNDER / COMMAND DECK</span>
          <h1 className="ds-display" style={{ fontSize: "clamp(2rem, 6vw, 5rem)", margin: ".5rem 0" }}>AI Cofounder</h1>
          <p style={{ color: "var(--ds-muted)" }}>Product contracts, evidence, and human approvals in one controlled contour.</p>
        </div>
        <PresetSwitcher />
      </section>
      <MemoryLayerRail counts={{ Atomic: 12, Semantic: 8, Episodic: 4, Procedural: 3 }} />
      <OrbitalMemory />
      <section className="ds-hull ds-glass" style={{ padding: "clamp(1.25rem, 4vw, 3rem)" }}>
        <header style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
          <div><span className="ds-utility">WORKING CONTOUR</span><h2 className="ds-display">Controlled delivery</h2><p style={{ color: "var(--ds-muted)" }}>Expected result, evidence, and human approval in one contour.</p></div>
          <ShieldCheck aria-hidden="true" />
        </header>
        <button className="ds-hull ds-interactive ds-focus" style={{ marginTop: "1.5rem", padding: ".8rem 1.2rem", color: "var(--ds-ink)", background: "var(--ds-primary)", border: 0, cursor: "pointer" }} onClick={() => setOpen(true)}><FilePlus2 size={17} /> Create contract</button>
      </section>
      <dialog ref={dialogRef} className="ds-contract-dialog" aria-label="НОВЫЙ КОНТРАКТ" aria-labelledby="new-contract" open={open} onClose={() => setOpen(false)}>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="ds-dialog-close"><X size={18} /></button>
        <span className="ds-utility">AI COFOUNDER / NEW DELIVERY</span>
        <h2 id="new-contract" className="ds-display">New contract</h2>
        <p className="ds-dialog-copy">Describe the first product step. The system will preserve context and propose a delivery plan.</p>
        <form onSubmit={submitContract}>
          <label className="ds-field">Name<input required value={contractName} onChange={(event) => setContractName(event.target.value)} placeholder="Partner workspace" /></label>
          <label className="ds-field">Expected result<textarea required rows={4} placeholder="What should be ready to review?" /></label>
          <div className="ds-dialog-actions">
            <button type="button" className="ds-dialog-secondary" onClick={() => setOpen(false)}>Cancel</button>
            <button type="submit" className="ds-dialog-primary"><FilePlus2 size={16} /> Create plan</button>
          </div>
        </form>
      </dialog>
    </main>
  )
}
