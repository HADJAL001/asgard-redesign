"use client"

import { Check, Clapperboard, LockKeyhole } from "lucide-react"

type StoryboardPlan = {
  revision: number
  slots: { id: string; component: string; role: string; states: string[] }[]
  stages: string[]
}

const sceneNames = ["Intent", "Architecture", "Build", "Preview", "Approval"]

export function StoryboardRail({ plan, approved = false }: { plan: StoryboardPlan | null; approved?: boolean }) {
  if (!plan) return null
  const scenes = plan.stages.length ? plan.stages : sceneNames
  return (
    <section className="ds-hull ds-glass ds-storyboard" aria-labelledby="storyboard-title">
      <style>{`\n        .ds-storyboard{padding:clamp(1.2rem,3vw,2.4rem);margin-top:1rem}.ds-storyboard__head{display:flex;justify-content:space-between;gap:1rem;align-items:flex-start}.ds-storyboard__head h2{margin:.45rem 0;font-size:clamp(1.35rem,3vw,2.2rem)}.ds-storyboard__head p{max-width:620px;color:var(--ds-muted);margin:0;line-height:1.5}.ds-storyboard__status{display:inline-flex;align-items:center;gap:.35rem;padding:.45rem .65rem;border:1px solid color-mix(in srgb,var(--ds-line) 70%,transparent);color:var(--ds-muted);font-size:.72rem;text-transform:uppercase;letter-spacing:.08em;white-space:nowrap}.ds-storyboard__status[data-approved=true]{color:var(--ds-primary);border-color:color-mix(in srgb,var(--ds-primary) 55%,transparent)}.ds-storyboard__rail{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:.75rem;list-style:none;margin:1.4rem 0 0;padding:0}.ds-storyboard__scene{min-width:0}.ds-storyboard__index{display:block;color:var(--ds-primary);font:600 .68rem/1 var(--font-space-grotesk),sans-serif;letter-spacing:.12em;margin-bottom:.4rem}.ds-storyboard__frame{position:relative;min-height:118px;display:flex;flex-direction:column;justify-content:flex-end;gap:.25rem;overflow:hidden;padding:.8rem;background:linear-gradient(145deg,color-mix(in srgb,var(--ds-surface) 90%,transparent),rgba(0,0,0,.28));border:1px solid color-mix(in srgb,var(--ds-line) 75%,transparent);clip-path:polygon(0 0,96% 0,100% 12%,100% 100%,4% 100%,0 88%)}.ds-storyboard__frame strong{position:relative;font-size:.9rem}.ds-storyboard__frame small,.ds-storyboard__frame em{position:relative;color:var(--ds-muted);font-size:.7rem;line-height:1.35}.ds-storyboard__frame em{font-style:normal;color:color-mix(in srgb,var(--ds-primary) 80%,white)}.ds-storyboard__glow{position:absolute;width:90px;height:90px;right:-25px;top:-35px;border-radius:50%;background:color-mix(in srgb,var(--ds-primary) 22%,transparent);filter:blur(18px)}@media(max-width:760px){.ds-storyboard__head{flex-direction:column}.ds-storyboard__rail{display:flex;overflow-x:auto;padding-bottom:.35rem;scroll-snap-type:x mandatory}.ds-storyboard__scene{flex:0 0 min(72vw,220px);scroll-snap-align:start}}\n      `}</style>
      <header className="ds-storyboard__head">
        <div>
          <span className="ds-utility"><Clapperboard size={14} aria-hidden="true" /> VISUAL STORYBOARD / REVISION {plan.revision}</span>
          <h2 id="storyboard-title" className="ds-display">Сцены продукта до codegen</h2>
          <p>Проверьте последовательность результата до запуска генерации. Каждая сцена связана с blueprint и evidence.</p>
        </div>
        <span className="ds-storyboard__status" data-approved={approved}>{approved ? <><Check size={14} aria-hidden="true" /> Approved</> : <><LockKeyhole size={14} aria-hidden="true" /> Needs approval</>}</span>
      </header>
      <ol className="ds-storyboard__rail">
        {scenes.map((stage, index) => {
          const slot = plan.slots[index % Math.max(1, plan.slots.length)]
          return <li key={`${stage}-${index}`} className="ds-storyboard__scene">
            <span className="ds-storyboard__index">{String(index + 1).padStart(2, "0")}</span>
            <div className="ds-storyboard__frame" aria-label={`${stage} scene`}>
              <span className="ds-storyboard__glow" aria-hidden="true" />
              <strong>{stage}</strong>
              <small>{slot ? slot.role : "Evidence checkpoint"}</small>
              <em>{slot?.component || "quality-gate"}</em>
            </div>
          </li>
        })}
      </ol>
    </section>
  )
}
