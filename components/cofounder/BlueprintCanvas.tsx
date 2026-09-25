"use client"

import { Check, Monitor, Pencil, Redo2, Smartphone, Sparkles, Undo2 } from "lucide-react"
import { useState } from "react"
import type { ProductType, VisualPreset } from "@/components/cofounder/ProductCatalog"

type PreviewSlot = { id: string; component: string; role: string; states: string[] }

export type BlueprintCanvasPlan = { revision: number; slots: PreviewSlot[]; stages: string[] }

export function BlueprintCanvas({ plan, productType, preset, onCreate, onSave, saving = false }: { plan: BlueprintCanvasPlan | null; productType: ProductType; preset: VisualPreset; onCreate: () => void; onSave?: (slots: PreviewSlot[]) => void; saving?: boolean }) {
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop")
  const [slots, setSlots] = useState<PreviewSlot[]>(plan?.slots || [])
  const [past, setPast] = useState<PreviewSlot[][]>([])
  const [future, setFuture] = useState<PreviewSlot[][]>([])
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  function commitSlots(next: PreviewSlot[]) {
    if (next === slots) return
    setPast((history) => [...history, slots].slice(-30))
    setFuture([])
    setSlots(next)
  }
  function reorderSlot(fromId: string, toId: string) {
    if (fromId === toId) return
    const from = slots.findIndex((slot) => slot.id === fromId)
    const to = slots.findIndex((slot) => slot.id === toId)
    if (from < 0 || to < 0) return
    const next = [...slots]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    commitSlots(next)
  }
  function moveBy(index: number, delta: number) {
    const target = index + delta
    if (target < 0 || target >= slots.length) return
    reorderSlot(slots[index].id, slots[target].id)
    setDirty(true)
  }
  function updateRole(id: string, role: string) {
    commitSlots(slots.map((slot) => slot.id === id ? { ...slot, role } : slot))
    setDirty(true)
  }
  function undo() {
    const previous = past.at(-1)
    if (!previous) return
    setPast((history) => history.slice(0, -1))
    setFuture((history) => [slots, ...history].slice(0, 30))
    setSlots(previous)
    setDirty(true)
  }
  function redo() {
    const next = future[0]
    if (!next) return
    setFuture((history) => history.slice(1))
    setPast((history) => [...history, slots].slice(-30))
    setSlots(next)
    setDirty(true)
  }
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
        {plan ? <div className="ds-blueprint-canvas__surface"><div className="ds-blueprint-canvas__surface-bar"><span /><span /><span /><small>OSGARD / {label.toUpperCase()}</small><span className="ds-blueprint-canvas__history"><button type="button" className="ds-focus" onClick={undo} disabled={!past.length} aria-label="Undo canvas change" title="Undo last canvas change"><Undo2 size={13} aria-hidden="true" /></button><button type="button" className="ds-focus" onClick={redo} disabled={!future.length} aria-label="Redo canvas change" title="Redo canvas change"><Redo2 size={13} aria-hidden="true" /></button></span></div><div className="ds-blueprint-canvas__slots">{slots.map((slot, index) => <article key={slot.id} className={`ds-blueprint-canvas__slot${draggedId === slot.id ? " is-dragged" : ""}`} draggable onDragStart={() => setDraggedId(slot.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (draggedId) { reorderSlot(draggedId, slot.id); setDirty(true) }; setDraggedId(null) }} onDragEnd={() => setDraggedId(null)}><div className="ds-blueprint-canvas__slot-head"><span className="ds-utility">{slot.component}</span><span className="ds-blueprint-canvas__slot-actions"><button type="button" className="ds-focus" onClick={() => moveBy(index, -1)} disabled={index === 0} aria-label={`Move ${slot.role} up`} title="Move block up">↑</button><button type="button" className="ds-focus" onClick={() => moveBy(index, 1)} disabled={index === slots.length - 1} aria-label={`Move ${slot.role} down`} title="Move block down">↓</button><button type="button" className="ds-focus" onClick={(event) => { event.stopPropagation(); setEditingId(editingId === slot.id ? null : slot.id) }} aria-label={`${editingId === slot.id ? "Finish editing" : "Edit"} ${slot.role}`} title={editingId === slot.id ? "Finish editing block" : "Edit block label"}>{editingId === slot.id ? <Check size={12} aria-hidden="true" /> : <Pencil size={12} aria-hidden="true" />}</button></span></div>{editingId === slot.id ? <input className="ds-blueprint-canvas__edit" autoFocus value={slot.role} aria-label={`Edit ${slot.role} label`} onClick={(event) => event.stopPropagation()} onChange={(event) => updateRole(slot.id, event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === "Escape") setEditingId(null) }} /> : <strong>{slot.role}</strong>}<small>{slot.states.join(" · ")}</small></article>)}</div></div> : <div className="ds-blueprint-canvas__empty"><Sparkles size={20} aria-hidden="true" /><strong>Ваш продукт появится здесь</strong><span>Выберите тип, стиль и создайте blueprint. Canvas обновится без перехода на другую страницу.</span><button type="button" className="ds-dialog-primary ds-focus" onClick={onCreate}>Открыть builder</button></div>}
      </div>
      <footer className="ds-blueprint-canvas__foot"><span>{plan ? `${slots.length} editable blocks · ${plan.stages.length} delivery stages` : "No blueprint yet"}</span><span>{dirty ? <><span>Draft changes · not saved</span>{onSave ? <button type="button" className="ds-blueprint-canvas__save ds-focus" onClick={() => onSave(slots)} disabled={saving}>{saving ? "Saving…" : "Save revision"}</button> : null}</> : viewport === "desktop" ? "Desktop 1440" : "Mobile 390"}</span></footer>
    </section>
  )
}
