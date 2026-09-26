"use client";
import {
  Check,
  Monitor,
  Pencil,
  Redo2,
  Smartphone,
  Sparkles,
  Undo2,
} from "lucide-react";
import { useState } from "react";
import type {
  ProductType,
  VisualPreset,
} from "@/components/cofounder/ProductCatalog";
type PreviewSlot = {
  id: string;
  component: string;
  role: string;
  states: string[];
};
export type BlueprintCanvasPlan = {
  revision: number;
  slots: PreviewSlot[];
  stages: string[];
};
export function BlueprintCanvas({
  plan,
  productType,
  preset,
  onCreate,
  onSave,
  saving = false,
}: {
  plan: BlueprintCanvasPlan | null;
  productType: ProductType;
  preset: VisualPreset;
  onCreate: () => void;
  onSave?: (slots: PreviewSlot[]) => void;
  saving?: boolean;
}) {
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop");
  const [slots, setSlots] = useState<PreviewSlot[]>(plan?.slots || []);
  const [past, setPast] = useState<PreviewSlot[][]>([]);
  const [future, setFuture] = useState<PreviewSlot[][]>([]);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  function commitSlots(next: PreviewSlot[]) {
    if (next === slots) return;
    setPast((h) => [...h, slots].slice(-30));
    setFuture([]);
    setSlots(next);
  }
  function reorderSlot(fromId: string, toId: string) {
    if (fromId === toId) return;
    const from = slots.findIndex((s) => s.id === fromId);
    const to = slots.findIndex((s) => s.id === toId);
    if (from < 0 || to < 0) return;
    const next = [...slots];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    commitSlots(next);
  }
  function moveBy(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= slots.length) return;
    reorderSlot(slots[index].id, slots[target].id);
    setDirty(true);
  }
  function updateRole(id: string, role: string) {
    commitSlots(slots.map((s) => (s.id === id ? { ...s, role } : s)));
    setDirty(true);
  }
  function applyToSelection(transform: (slot: PreviewSlot) => PreviewSlot) {
    if (!selectedIds.length) return;
    commitSlots(
      slots.map((s) => (selectedIds.includes(s.id) ? transform(s) : s)),
    );
    setDirty(true);
  }
  function undo() {
    const previous = past.at(-1);
    if (!previous) return;
    setPast((h) => h.slice(0, -1));
    setFuture((h) => [slots, ...h].slice(0, 30));
    setSlots(previous);
    setDirty(true);
  }
  function redo() {
    const next = future[0];
    if (!next) return;
    setFuture((h) => h.slice(1));
    setPast((h) => [...h, slots].slice(-30));
    setSlots(next);
    setDirty(true);
  }
  const label =
    productType === "ai-tool"
      ? "AI product"
      : productType[0].toUpperCase() + productType.slice(1);
  return (
    <section
      className="ds-blueprint-canvas ds-glass ds-hull"
      aria-label="Live product preview"
    >
      <header className="ds-blueprint-canvas__head">
        <div>
          <span className="ds-utility">LIVE CANVAS / PRODUCT TWIN</span>
          <h2 className="ds-display">Рабочая область результата</h2>
          <p>
            {plan
              ? `Revision ${plan.revision} · ${label} · ${preset} DNA`
              : "Соберите blueprint, чтобы увидеть структуру продукта здесь."}
          </p>
        </div>
        <div
          className="ds-blueprint-canvas__controls"
          role="group"
          aria-label="Preview size"
        >
          <button
            type="button"
            className="ds-focus"
            aria-pressed={viewport === "desktop"}
            onClick={() => setViewport("desktop")}
            aria-label="Desktop preview"
            title="Desktop preview (1440px)"
          >
            <Monitor size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="ds-focus"
            aria-pressed={viewport === "mobile"}
            onClick={() => setViewport("mobile")}
            aria-label="Mobile preview"
            title="Mobile preview (390px)"
          >
            <Smartphone size={15} aria-hidden="true" />
          </button>
        </div>
      </header>
      <div
        className={`ds-blueprint-canvas__stage ds-blueprint-canvas__stage--${viewport}`}
      >
        {plan ? (
          <div className="ds-blueprint-canvas__surface">
            <div className="ds-blueprint-canvas__surface-bar">
              <span />
              <span />
              <span />
              <small>OSGARD / {label.toUpperCase()}</small>
              <span className="ds-blueprint-canvas__history">
                <button
                  type="button"
                  className="ds-focus"
                  onClick={undo}
                  disabled={!past.length}
                  aria-label="Undo"
                  title="Undo last canvas change"
                >
                  <Undo2 size={13} />
                </button>
                <button
                  type="button"
                  className="ds-focus"
                  onClick={redo}
                  disabled={!future.length}
                  aria-label="Redo"
                  title="Redo canvas change"
                >
                  <Redo2 size={13} />
                </button>
              </span>
            </div>
            <div
              className="ds-blueprint-canvas__selection-toolbar"
              role="toolbar"
              aria-label="Bulk canvas actions"
            >
              <span aria-live="polite">
                {selectedIds.length
                  ? `${selectedIds.length} selected`
                  : "Select blocks to edit together"}
              </span>
              <button
                type="button"
                className="ds-focus"
                onClick={() =>
                  applyToSelection((s) => ({
                    ...s,
                    states: Array.from(new Set([...s.states, "dense layout"])),
                  }))
                }
                disabled={!selectedIds.length}
                title="Apply dense layout to selected blocks"
              >
                Dense
              </button>
              <button
                type="button"
                className="ds-focus"
                onClick={() =>
                  applyToSelection((s) => ({
                    ...s,
                    states: Array.from(new Set([...s.states, "mobile ready"])),
                  }))
                }
                disabled={!selectedIds.length}
                title="Mark selected blocks as mobile-ready"
              >
                Mobile
              </button>
              {selectedIds.length ? (
                <button
                  type="button"
                  className="ds-focus"
                  onClick={() => setSelectedIds([])}
                  title="Clear selected blocks"
                >
                  Clear
                </button>
              ) : null}
            </div>
            <div className="ds-blueprint-canvas__slots" role="listbox" aria-label="Editable product blocks" aria-multiselectable="true">
              {slots.map((slot, index) => (
                <article
                  key={slot.id}
                  className={`ds-blueprint-canvas__slot${draggedId === slot.id ? " is-dragged" : ""}${selectedIds.includes(slot.id) ? " is-selected" : ""}`}
                  role="option"
                  tabIndex={0}
                  aria-selected={selectedIds.includes(slot.id)}
                  aria-label={`${slot.role}, ${selectedIds.includes(slot.id) ? "selected" : "not selected"}`}
                  draggable
                  onClick={() =>
                    setSelectedIds((ids) =>
                      ids.includes(slot.id)
                        ? ids.filter((id) => id !== slot.id)
                        : [...ids, slot.id],
                    )
                  }
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return
                    event.preventDefault()
                    setSelectedIds((ids) =>
                      ids.includes(slot.id)
                        ? ids.filter((id) => id !== slot.id)
                        : [...ids, slot.id],
                    )
                  }}
                  onDragStart={() => setDraggedId(slot.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (draggedId) {
                      reorderSlot(draggedId, slot.id);
                      setDirty(true);
                    }
                    setDraggedId(null);
                  }}
                  onDragEnd={() => setDraggedId(null)}
                >
                  <div className="ds-blueprint-canvas__slot-head">
                    <span className="ds-utility">{slot.component}</span>
                    <span className="ds-blueprint-canvas__slot-actions">
                      <button
                        type="button"
                        className="ds-focus"
                        aria-pressed={selectedIds.includes(slot.id)}
                        aria-label={`${selectedIds.includes(slot.id) ? "Remove" : "Add"} ${slot.role} ${selectedIds.includes(slot.id) ? "from" : "to"} selection`}
                        title={selectedIds.includes(slot.id) ? "Remove from selection" : "Add to selection"}
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedIds((ids) =>
                            ids.includes(slot.id)
                              ? ids.filter((id) => id !== slot.id)
                              : [...ids, slot.id],
                          );
                        }}
                      >
                        {selectedIds.includes(slot.id) ? "Selected" : "Select"}
                      </button>
                      <button
                        type="button"
                        className="ds-focus"
                        onClick={(e) => {
                          e.stopPropagation();
                          moveBy(index, -1);
                        }}
                        disabled={index === 0}
                        aria-label={`Move ${slot.role} earlier`}
                        title="Move block earlier"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="ds-focus"
                        onClick={(e) => {
                          e.stopPropagation();
                          moveBy(index, 1);
                        }}
                        disabled={index === slots.length - 1}
                        aria-label={`Move ${slot.role} later`}
                        title="Move block later"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="ds-focus"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingId(editingId === slot.id ? null : slot.id);
                        }}
                        aria-label={`${editingId === slot.id ? "Finish editing" : "Edit"} ${slot.role}`}
                        title={editingId === slot.id ? "Finish editing block" : "Edit block role"}
                      >
                        {editingId === slot.id ? (
                          <Check size={12} />
                        ) : (
                          <Pencil size={12} />
                        )}
                      </button>
                    </span>
                  </div>
                  {editingId === slot.id ? (
                    <input
                      className="ds-blueprint-canvas__edit"
                      autoFocus
                      value={slot.role}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => updateRole(slot.id, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === "Escape")
                          setEditingId(null);
                      }}
                    />
                  ) : (
                    <strong>{slot.role}</strong>
                  )}
                  <small>{slot.states.join(" · ")}</small>
                </article>
              ))}
            </div>
          </div>
        ) : (
          <div className="ds-blueprint-canvas__empty">
            <Sparkles size={20} />
            <strong>Your product will appear here</strong>
            <button
              type="button"
              className="ds-dialog-primary ds-focus"
              onClick={onCreate}
            >
              Open builder
            </button>
          </div>
        )}
      </div>
      <footer className="ds-blueprint-canvas__foot">
        <span>
          {plan
            ? `${slots.length} editable blocks · ${plan.stages.length} delivery stages`
            : "No blueprint yet"}
        </span>
        <span>
          {dirty && onSave ? (
            <button
              type="button"
              className="ds-blueprint-canvas__save ds-focus"
              onClick={() => onSave(slots)}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save revision"}
            </button>
          ) : viewport === "desktop" ? (
            "Desktop 1440"
          ) : (
            "Mobile 390"
          )}
        </span>
      </footer>
    </section>
  );
}
