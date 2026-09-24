"use client"

import { Check, Globe2, LayoutDashboard, PanelsTopLeft, ShoppingBag, Sparkles, UsersRound } from "lucide-react"
import type { CSSProperties, KeyboardEvent } from "react"

export type ProductType = "social" | "application" | "website" | "marketplace" | "dashboard" | "ai-tool"
export type VisualPreset = "minimal" | "bold" | "playful" | "corporate" | "futuristic"

const products: { id: ProductType; label: string; detail: string; Icon: typeof Globe2 }[] = [
  { id: "social", label: "Social network", detail: "Profiles, feed, community", Icon: UsersRound },
  { id: "application", label: "Application", detail: "A focused product workflow", Icon: PanelsTopLeft },
  { id: "website", label: "Website", detail: "A cinematic public presence", Icon: Globe2 },
  { id: "marketplace", label: "Marketplace", detail: "Catalog, commerce, trust", Icon: ShoppingBag },
  { id: "dashboard", label: "Dashboard", detail: "Signals, metrics, control", Icon: LayoutDashboard },
  { id: "ai-tool", label: "AI product", detail: "Agents, memory, automation", Icon: Sparkles },
]

const presets: { id: VisualPreset; label: string; detail: string; color: string }[] = [
  { id: "minimal", label: "Minimal", detail: "Quiet, precise, fast", color: "#d7f4ff" },
  { id: "bold", label: "Bold", detail: "High contrast, decisive", color: "#ff8e70" },
  { id: "playful", label: "Playful", detail: "Warm, expressive, alive", color: "#f5c451" },
  { id: "corporate", label: "Corporate", detail: "Clear, trusted, composed", color: "#9bbcff" },
  { id: "futuristic", label: "Futuristic", detail: "Hull, glow, command deck", color: "#64d9e8" },
]

function moveSelection<T extends string>(event: KeyboardEvent<HTMLButtonElement>, values: readonly T[], current: T, onChange: (value: T) => void) {
  const direction = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0
  if (!direction) return
  event.preventDefault()
  const index = values.indexOf(current)
  onChange(values[(index + direction + values.length) % values.length])
}

export function ProductCatalog({ productType, preset, onProductTypeChange, onPresetChange }: { productType: ProductType; preset: VisualPreset; onProductTypeChange: (value: ProductType) => void; onPresetChange: (value: VisualPreset) => void }) {
  const selectedProduct = products.find((item) => item.id === productType) || products[0]
  const selectedPreset = presets.find((item) => item.id === preset) || presets[4]
  return (
    <section className="ds-hull ds-glass ds-catalog" aria-labelledby="catalog-title">
      <header className="ds-catalog-head">
        <div>
          <span className="ds-utility">PRODUCT CATALOG / BUILD DNA</span>
          <h2 id="catalog-title" className="ds-display">Choose the world to build</h2>
          <p>Start with the product shape and visual language. The AI compiler carries both into preview and codegen.</p>
        </div>
        <div className="ds-catalog-readout" aria-live="polite"><span>SELECTED VECTOR</span><strong>{selectedProduct.label}</strong><small>{selectedPreset.label} DNA</small></div>
      </header>
      <div className="ds-catalog-columns">
        <div>
          <span className="ds-catalog-label">Product type</span>
          <div className="ds-catalog-grid" role="listbox" aria-label="Product type">
            {products.map(({ id, label, detail, Icon }) => {
              const selected = id === productType
              return <button key={id} type="button" role="option" tabIndex={selected ? 0 : -1} aria-selected={selected} className="ds-catalog-card ds-catalog-card--holo ds-focus" data-selected={selected} onPointerMove={(event) => { const rect = event.currentTarget.getBoundingClientRect(); event.currentTarget.style.setProperty("--tilt-x", `${((event.clientY - rect.top) / rect.height - .5) * -4}deg`); event.currentTarget.style.setProperty("--tilt-y", `${((event.clientX - rect.left) / rect.width - .5) * 4}deg`) }} onPointerLeave={(event) => { event.currentTarget.style.removeProperty("--tilt-x"); event.currentTarget.style.removeProperty("--tilt-y") }} onKeyDown={(event) => moveSelection(event, products.map((product) => product.id), productType, onProductTypeChange)} onClick={() => onProductTypeChange(id)}><span className="ds-catalog-icon"><Icon size={18} aria-hidden="true" /></span><span><strong>{label}</strong><small>{detail}</small></span>{selected ? <Check size={15} aria-hidden="true" /> : null}</button>
            })}
          </div>
        </div>
        <div>
          <span className="ds-catalog-label">Visual DNA</span>
          <div className="ds-catalog-presets" role="radiogroup" aria-label="Visual DNA">
            {presets.map(({ id, label, detail, color }) => {
              const selected = id === preset
              return <button key={id} type="button" role="radio" tabIndex={selected ? 0 : -1} aria-checked={selected} className="ds-catalog-preset ds-focus" data-selected={selected} onKeyDown={(event) => moveSelection(event, presets.map((presetItem) => presetItem.id), preset, onPresetChange)} onClick={() => onPresetChange(id)}><i className={`ds-dna-preview ds-dna-${id}`} aria-hidden="true" style={{ "--dna-color": color } as CSSProperties} /><span><strong>{label}</strong><small>{detail}</small></span>{selected ? <Check size={15} aria-hidden="true" /> : null}</button>
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
