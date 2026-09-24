"use client"

import Link from "next/link"
import { useEffect } from "react"
import { ArrowLeft, RotateCcw, Terminal } from "lucide-react"
import { captureError } from "@/lib/sentry-client"
import { track } from "@/lib/analytics"

export function DevErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    captureError("[dev/error]", error)
    track("recovery_surface_shown", { surface: "developer_mode" })
  }, [error])

  return (
    <main className="dev-mode-layout min-h-screen px-5 py-10" style={{ display: "grid", placeItems: "center" }}>
      <section className="ds-hull ds-glass" role="alert" aria-labelledby="dev-error-title" style={{ maxWidth: 680, width: "100%", padding: "clamp(1.5rem, 5vw, 3rem)", textAlign: "center" }}>
        <Terminal aria-hidden="true" size={30} style={{ color: "#7dd3fc", margin: "0 auto 1rem" }} />
        <span className="ds-utility">DEVELOPER MODE / RECOVERY</span>
        <h1 id="dev-error-title" className="ds-display" style={{ margin: ".65rem 0", fontSize: "clamp(1.5rem, 4vw, 2.4rem)" }}>Workspace paused</h1>
        <p style={{ color: "var(--ds-muted)", maxWidth: 500, margin: "0 auto 1.5rem" }}>One developer surface failed to render. Your workspace data is preserved.</p>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: ".7rem" }}>
          <button type="button" className="ds-dialog-primary ds-focus" onClick={() => reset()}><RotateCcw size={16} aria-hidden="true" /> Try again</button>
          <Link className="ds-dialog-secondary ds-focus" href="/dev"><ArrowLeft size={16} aria-hidden="true" /> Developer home</Link>
        </div>
      </section>
    </main>
  )
}
