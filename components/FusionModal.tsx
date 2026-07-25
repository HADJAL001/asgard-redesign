"use client"

/* ================================================================
   FusionModal — слияние двух своих артефактов в AI-потомка.
   Выбор 2 «свободных» (kept) артефактов → POST /artifacts/fuse →
   reveal потомка (+ бейдж мутации). Родители сгорают на бэкенде.
   ================================================================ */

import { useState } from "react"
import { useOsgardStore, type OsgardArtifact } from "@/lib/store/osgard-store"

const RARITY_COLOR: Record<string, string> = {
  common: "#9CA3AF",
  rare: "#00D4FF",
  epic: "#A855F7",
  legendary: "#F59E0B",
  mythic: "#EF4444",
}

export function FusionModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { artifacts, fuseArtifacts } = useOsgardStore()
  const [selected, setSelected] = useState<number[]>([])
  const [fusing, setFusing] = useState(false)
  const [result, setResult] = useState<{ artifact: OsgardArtifact; mutation: boolean } | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  const kept = artifacts.filter((a) => a.status === "kept")

  function toggle(id: number) {
    setError(null)
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < 2 ? [...s, id] : s))
  }

  async function doFuse() {
    if (selected.length !== 2 || fusing) return
    setFusing(true)
    setError(null)
    const r = await fuseArtifacts(selected[0], selected[1])
    setFusing(false)
    if (r.success && r.artifact) {
      setResult({ artifact: r.artifact, mutation: !!r.mutation })
      setSelected([])
    } else {
      setError(r.error || "Слияние не удалось")
    }
  }

  function reset() {
    setResult(null)
    setSelected([])
    setError(null)
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl p-6"
        style={{ background: "#14141E", border: "1px solid #2A2A3E" }}
        onClick={(e) => e.stopPropagation()}
      >
        {result ? (
          <div className="text-center">
            <div
              className="mb-2 text-[13px] font-semibold tracking-wider"
              style={{ color: result.mutation ? "#EF4444" : "#D4AF37" }}
            >
              {result.mutation ? "✨ МУТАЦИЯ!" : "СЛИЯНИЕ ЗАВЕРШЕНО"}
            </div>
            <h3 className="text-[22px] font-bold text-white">{result.artifact.name}</h3>
            <div className="mt-1 text-[13px] font-semibold" style={{ color: RARITY_COLOR[result.artifact.rarity] || "#9CA3AF" }}>
              {result.artifact.rarity}
            </div>
            {result.artifact.lore && (
              <p className="mt-3 text-[13px]" style={{ color: "rgba(255,255,255,0.55)" }}>{result.artifact.lore}</p>
            )}
            <div className="mt-4 flex justify-center gap-4 text-[13px] text-white">
              <span>⚔ {result.artifact.power}</span>
              <span>🛡 {result.artifact.defense}</span>
              <span>✨ {result.artifact.magic}</span>
              <span>⚡ {result.artifact.speed}</span>
            </div>
            <div className="mt-6 flex justify-center gap-3">
              <button
                onClick={reset}
                className="rounded-xl px-4 py-2 text-[13px] font-semibold"
                style={{ background: "rgba(255,255,255,0.08)", color: "#fff" }}
              >
                Слить ещё
              </button>
              <button
                onClick={onClose}
                className="rounded-xl px-4 py-2 text-[13px] font-semibold"
                style={{ background: "linear-gradient(135deg,#D4AF37,#F5C542)", color: "#1A1400" }}
              >
                Готово
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-[18px] font-semibold text-white">🔀 Слияние артефактов</h3>
              <button onClick={onClose} aria-label="Закрыть" className="text-[20px] leading-none" style={{ color: "rgba(255,255,255,0.4)" }}>
                ×
              </button>
            </div>
            <p className="mb-4 text-[13px]" style={{ color: "rgba(255,255,255,0.5)" }}>
              Выбери 2 артефакта — ИИ выкует потомка. Родители сгорают. Есть шанс мутации!
            </p>
            {kept.length < 2 ? (
              <p className="py-8 text-center text-[14px]" style={{ color: "rgba(255,255,255,0.5)" }}>
                Нужно минимум 2 свободных артефакта. Сначала выкуй ещё.
              </p>
            ) : (
              <div className="grid max-h-[50vh] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
                {kept.map((a) => {
                  const sel = selected.includes(a.id)
                  const color = RARITY_COLOR[a.rarity] || "#9CA3AF"
                  return (
                    <button
                      key={a.id}
                      onClick={() => toggle(a.id)}
                      className="rounded-xl p-3 text-left transition-all"
                      style={{
                        background: sel ? "rgba(212,175,55,0.12)" : "#1A1A24",
                        border: `1px solid ${sel ? "#D4AF37" : "#2A2A3E"}`,
                      }}
                    >
                      <div className="truncate text-[12px] font-medium text-white">{a.name}</div>
                      <div className="text-[10px]" style={{ color }}>{a.rarity}</div>
                      <div className="mt-1 text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                        ⚔{a.power} 🛡{a.defense} ✨{a.magic} ⚡{a.speed}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
            {error && <p className="mt-3 text-[13px]" style={{ color: "#EF4444" }}>{error}</p>}
            <div className="mt-4 flex items-center justify-between">
              <span className="text-[13px]" style={{ color: "rgba(255,255,255,0.5)" }}>Выбрано {selected.length}/2</span>
              <button
                onClick={doFuse}
                disabled={selected.length !== 2 || fusing}
                className="rounded-xl px-5 py-2 text-[13px] font-semibold transition-all disabled:opacity-50"
                style={{
                  background: selected.length === 2 ? "linear-gradient(135deg,#D4AF37,#F5C542)" : "rgba(255,255,255,0.08)",
                  color: selected.length === 2 ? "#1A1400" : "rgba(255,255,255,0.5)",
                }}
              >
                {fusing ? "Слияние…" : "🔀 Слить"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
