"use client"

import { Check, Circle, Loader2 } from "lucide-react"

export type SequenceStage = { label: string; detail: string; status: "complete" | "active" | "pending" }

export function CinematicSequence({ stages }: { stages: SequenceStage[] }) {
  return (
    <section className="ds-sequence ds-glass ds-hull" aria-label="Этапы создания продукта">
      <header className="ds-sequence__header">
        <span className="ds-utility">CINEMATIC DELIVERY</span>
        <span className="ds-sequence__signal"><i aria-hidden="true" /> LIVE STORY</span>
      </header>
      <ol className="ds-sequence__rail">
        {stages.map((stage, index) => (
          <li key={stage.label} className={`ds-sequence__stage ds-sequence__stage--${stage.status}`}>
            <span className="ds-sequence__marker" aria-hidden="true">
              {stage.status === "complete" ? <Check size={14} /> : stage.status === "active" ? <Loader2 size={14} /> : <Circle size={10} />}
            </span>
            <span className="ds-sequence__copy"><strong>{stage.label}</strong><small>{stage.detail}</small></span>
            {index < stages.length - 1 ? <span className="ds-sequence__connector" aria-hidden="true" /> : null}
          </li>
        ))}
      </ol>
    </section>
  )
}
