"use client"

import { Monitor, Smartphone, Sparkles } from "lucide-react"
import { useState } from "react"
import type { ProductType, VisualPreset } from "@/components/cofounder/ProductCatalog"

type PreviewSlot = { id: string; component: string; role: string; states: string[] }

export type BlueprintCanvasPlan = { revision: number; slots: PreviewSlot[]; stages: string[] }

export function BlueprintCanvas({ plan, productType, preset, onCreate }: { plan: BlueprintCanvasPlan | null; productType: ProductType; preset: VisualPreset; onCreate: () => void }) {
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop")
  const label = productType === "ai-tool" ? "AI product" : productType[0].toUpperCase() + productType.slice(1)
  return (
    <section className="ds-blueprint-canvas ds-glass ds-hull" aria-label="Live product preview">
      <header className="ds-blueprint-canvas__head">
        <div><span className="ds-utility">LIVE CANVAS / PRODUCT TWIN</span><h2 className="ds-display">Рабочая область результата</h2><p>{plan ? `Revision ${plan.revision} · ${label} · ${preset} DNA` : "Соберите blueprint, чтобы увидеть структуру продукта здесь."}</p></div>
        <div className="ds-blueprint-canvas__controls" role="group" aria-label="Размер preview">
          <button type="button" className="ds-focus" aria-pressed={viewport === "desktop"} aria-label="Показать desktop preview" title="Desktop preview" onClick={() => setViewport("desktop")}><Monitor size={15} aria-hidden="true" /></button>
          <button type="button" className="ds-focus" aria-pressed={viewport === "mobile"} aria-label="Показать mobile preview" title="Mobile preview" onClick={() => setViewport("mobile")}><Smartphone size={15} aria-hidden="true" /></button>
        </div>
      </header>
      <div className={`ds-blueprint-canvas__stage ds-blueprint-canvas__stage--${viewport}`}>
        {plan ? <div className="ds-blueprint-canvas__surface"><div className="ds-blueprint-canvas__surface-bar"><span /><span /><span /><small>OSGARD / {label.toUpperCase()}</small></div><div className="ds-blueprint-canvas__slots">{plan.slots.map((slot) => <article key={slot.id} className="ds-blueprint-canvas__slot"><span className="ds-utility">{slot.component}</span><strong>{slot.role}</strong><small>{slot.states.join(" · ")}</small></article>)}</div></div> : <div className="ds-blueprint-canvas__empty"><Sparkles size={20} aria-hidden="true" /><strong>Ваш продукт появится здесь</strong><span>Выберите тип, стиль и создайте blueprint. Canvas обновится без перехода на другую страницу.</span><button type="button" className="ds-dialog-primary ds-focus" onClick={onCreate}>Открыть builder</button></div>}
      </div>
      <footer className="ds-blueprint-canvas__foot"><span>{plan ? `${plan.slots.length} interface blocks · ${plan.stages.length} delivery stages` : "No blueprint yet"}</span><span>{viewport === "desktop" ? "Desktop 1440" : "Mobile 390"}</span></footer>
    </section>
  )
}
