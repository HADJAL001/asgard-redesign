"use client"

import Link from "next/link"
import { useEffect } from "react"
import { ArrowLeft, RotateCcw, ShieldAlert } from "lucide-react"
import { captureError } from "@/lib/sentry-client"

export default function CofounderError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    captureError("[cofounder/error]", error)
  }, [error])

  return (
    <main className="ds-body" style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "1.5rem" }}>
      <section className="ds-hull ds-glass" role="alert" aria-labelledby="cofounder-error-title" style={{ maxWidth: 620, width: "100%", padding: "clamp(1.5rem, 5vw, 3rem)", textAlign: "center" }}>
        <ShieldAlert aria-hidden="true" size={32} style={{ color: "var(--ds-primary)", margin: "0 auto 1rem" }} />
        <span className="ds-utility">AI COFOUNDER / RECOVERY MODE</span>
        <h1 id="cofounder-error-title" className="ds-display" style={{ margin: ".65rem 0", fontSize: "clamp(1.6rem, 4vw, 2.5rem)" }}>Command deck paused</h1>
        <p style={{ color: "var(--ds-muted)", maxWidth: 460, margin: "0 auto 1.5rem" }}>The workspace could not be rendered. Your saved blueprints remain intact.</p>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: ".7rem" }}>
          <button type="button" className="ds-dialog-primary ds-focus" onClick={() => reset()}><RotateCcw size={16} aria-hidden="true" /> Try again</button>
          <Link className="ds-dialog-secondary ds-focus" href="/dev"><ArrowLeft size={16} aria-hidden="true" /> Back to command deck</Link>
        </div>
      </section>
    </main>
  )
}
