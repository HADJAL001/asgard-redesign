"use client"

import { useMemo, useState } from "react"
import { Navbar } from "./navbar"
import { useOsgard } from "./osgard-store"
import {
  ARTIFACTS,
  RARITY,
  RARITY_CHAIN,
  ARTIFACT_TYPES,
  CRAFT_COST,
  SPARK_CHANCE,
  nextRarity,
  formatTokens,
  type Artifact,
  type Rarity,
} from "@/lib/economy"
import { Sparkles, Plus, X, Infinity as InfinityIcon, Zap, RotateCcw } from "lucide-react"

const CARD = "#14141E"
const BORDER = "#2A2A3E"
const LABEL = "#6A6A8A"
const CYAN = "#00D4FF"

type Slot = Artifact | null

export function CraftView() {
  const { wallet, spend } = useOsgard()
  const [slotA, setSlotA] = useState<Slot>(null)
  const [slotB, setSlotB] = useState<Slot>(null)
  const [picking, setPicking] = useState<null | "a" | "b">(null)
  const [result, setResult] = useState<{ rarity: Rarity; name: string; spark: boolean } | null>(null)

  // Only artifacts the user kept can be used as reagents
  const owned = useMemo(() => ARTIFACTS.filter((a) => a.status === "kept" || a.status === "listed"), [])

  const canCraft =
    slotA !== null &&
    slotB !== null &&
    slotA.id !== slotB.id &&
    slotA.rarity === slotB.rarity &&
    nextRarity(slotA.rarity) !== null &&
    wallet.credits >= CRAFT_COST

  const targetRarity = slotA ? nextRarity(slotA.rarity) : null

  function pick(a: Artifact) {
    if (picking === "a") setSlotA(a)
    else if (picking === "b") setSlotB(a)
    setPicking(null)
  }

  function synthesize() {
    if (!canCraft || !slotA) return
    if (!spend("credits", CRAFT_COST)) return
    const spark = Math.random() < SPARK_CHANCE
    const rarity: Rarity = spark ? "mythic" : (nextRarity(slotA.rarity) as Rarity)
    setResult({
      rarity,
      name: `${ARTIFACT_TYPES[slotA.type].label} синтеза #${Math.floor(Math.random() * 900 + 100)}`,
      spark,
    })
    setSlotA(null)
    setSlotB(null)
  }

  return (
    <div
      className="min-h-screen font-sans"
      style={{ background: "linear-gradient(180deg, #0A0A0F 0%, #160B24 100%)", color: "#FFFFFF" }}
    >
      <Navbar />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[32px] font-medium tracking-tight">Синтез</h1>
            <p className="mt-1 text-[14px]" style={{ color: "rgba(255,255,255,0.4)" }}>
              Объедините два артефакта одной редкости в артефакт следующего уровня
            </p>
          </div>
          <div
            className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px]"
            style={{ border: `1px solid ${BORDER}`, color: "#F1C40F" }}
          >
            <Zap size={14} strokeWidth={1.75} aria-hidden="true" />
            {formatTokens(wallet.credits)} кредитов
          </div>
        </div>

        {/* Synthesis bench */}
        <div className="mt-8 grid grid-cols-1 items-center gap-4 lg:grid-cols-[1fr_auto_1fr_auto_1fr]">
          <ReagentSlot slot={slotA} onPick={() => setPicking("a")} onClear={() => setSlotA(null)} />
          <div className="flex justify-center">
            <Plus size={24} strokeWidth={1.5} style={{ color: LABEL }} aria-hidden="true" />
          </div>
          <ReagentSlot slot={slotB} onPick={() => setPicking("b")} onClear={() => setSlotB(null)} />
          <div className="flex justify-center">
            <Sparkles size={24} strokeWidth={1.5} style={{ color: canCraft ? CYAN : LABEL }} aria-hidden="true" />
          </div>
          <ResultSlot targetRarity={targetRarity} matched={canCraft} />
        </div>

        {/* Craft controls */}
        <div
          className="mt-6 flex flex-col items-center gap-3 rounded-2xl p-6"
          style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}
        >
          <div className="flex items-center gap-2 text-[14px]" style={{ color: LABEL }}>
            <span>Стоимость синтеза:</span>
            <span className="inline-flex items-center gap-1" style={{ color: "#F1C40F" }}>
              <Zap size={14} strokeWidth={1.75} aria-hidden="true" /> {CRAFT_COST} кредитов
            </span>
          </div>
          <p className="text-[12px]" style={{ color: "rgba(255,255,255,0.35)" }}>
            Шанс мифического всплеска: 1% · при успехе результат мгновенно становится мифическим
          </p>
          <button
            type="button"
            onClick={synthesize}
            disabled={!canCraft}
            className="mt-1 rounded-full px-8 py-3 text-[15px] font-medium transition-opacity"
            style={{
              backgroundColor: canCraft ? CYAN : "#1A1A24",
              color: canCraft ? "#0A0A0F" : "rgba(255,255,255,0.3)",
              cursor: canCraft ? "pointer" : "not-allowed",
            }}
          >
            Синтезировать
          </button>
          {slotA && slotB && slotA.rarity !== slotB.rarity && (
            <p className="text-[12px]" style={{ color: "#F87171" }}>
              Оба артефакта должны быть одной редкости
            </p>
          )}
        </div>

        {/* Rarity ladder legend */}
        <div className="mt-8">
          <h2 className="mb-3 text-[13px] uppercase tracking-wider" style={{ color: LABEL }}>
            Цепочка эволюции
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {RARITY_CHAIN.map((r, i) => (
              <div key={r} className="flex items-center gap-2">
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px]"
                  style={{ border: `1px solid ${RARITY[r].color}`, color: RARITY[r].color }}
                >
                  {RARITY[r].symbol} {RARITY[r].label}
                </span>
                {i < RARITY_CHAIN.length - 1 && (
                  <span style={{ color: LABEL }} aria-hidden="true">
                    →
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Reagent picker modal */}
      {picking && (
        <Modal onClose={() => setPicking(null)} title="Выберите артефакт">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {owned.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => pick(a)}
                className="rounded-xl p-4 text-left transition-colors"
                style={{ backgroundColor: "#0A0A0F", border: `1px solid ${BORDER}` }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = RARITY[a.rarity].color)}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = BORDER)}
              >
                <span className="text-[18px]" style={{ color: RARITY[a.rarity].color }}>
                  {RARITY[a.rarity].symbol}
                </span>
                <p className="mt-2 truncate text-[13px] font-medium">{a.name}</p>
                <p className="text-[11px]" style={{ color: LABEL }}>
                  {RARITY[a.rarity].label}
                </p>
              </button>
            ))}
          </div>
        </Modal>
      )}

      {/* Result modal */}
      {result && (
        <Modal onClose={() => setResult(null)} title={result.spark ? "Мифический всплеск!" : "Синтез завершён"}>
          <div className="flex flex-col items-center py-4 text-center">
            <div
              className="flex size-24 items-center justify-center rounded-2xl text-[44px]"
              style={{
                border: `2px solid ${RARITY[result.rarity].color}`,
                color: RARITY[result.rarity].color,
                boxShadow: result.spark ? `0 0 40px ${RARITY[result.rarity].color}66` : "none",
              }}
            >
              {RARITY[result.rarity].symbol}
            </div>
            <p className="mt-4 text-[18px] font-medium">{result.name}</p>
            <p className="mt-1 text-[14px]" style={{ color: RARITY[result.rarity].color }}>
              {RARITY[result.rarity].label}
            </p>
            {result.spark && (
              <p className="mt-2 inline-flex items-center gap-1 text-[13px]" style={{ color: "#E74C3C" }}>
                <InfinityIcon size={14} strokeWidth={1.75} aria-hidden="true" /> 1% шанс сработал
              </p>
            )}
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setResult(null)}
                className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[14px] font-medium"
                style={{ backgroundColor: CYAN, color: "#0A0A0F" }}
              >
                <RotateCcw size={15} strokeWidth={1.75} aria-hidden="true" />
                Синтезировать ещё
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

function ReagentSlot({ slot, onPick, onClear }: { slot: Slot; onPick: () => void; onClear: () => void }) {
  if (!slot) {
    return (
      <button
        type="button"
        onClick={onPick}
        className="flex aspect-square w-full flex-col items-center justify-center rounded-2xl text-[13px] transition-colors"
        style={{ border: `1px dashed ${BORDER}`, color: LABEL, minHeight: 180 }}
        onMouseEnter={(e) => (e.currentTarget.style.borderColor = CYAN)}
        onMouseLeave={(e) => (e.currentTarget.style.borderColor = BORDER)}
      >
        <Plus size={28} strokeWidth={1.25} aria-hidden="true" />
        <span className="mt-2">Выбрать артефакт</span>
      </button>
    )
  }
  return (
    <div
      className="relative flex aspect-square w-full flex-col items-center justify-center rounded-2xl p-4"
      style={{ border: `2px solid ${RARITY[slot.rarity].color}`, backgroundColor: CARD, minHeight: 180 }}
    >
      <button
        type="button"
        onClick={onClear}
        aria-label="Убрать"
        className="absolute right-3 top-3"
        style={{ color: LABEL }}
      >
        <X size={16} strokeWidth={1.75} aria-hidden="true" />
      </button>
      <span className="text-[40px]" style={{ color: RARITY[slot.rarity].color }}>
        {RARITY[slot.rarity].symbol}
      </span>
      <p className="mt-3 text-center text-[13px] font-medium">{slot.name}</p>
      <p className="text-[11px]" style={{ color: RARITY[slot.rarity].color }}>
        {RARITY[slot.rarity].label}
      </p>
    </div>
  )
}

function ResultSlot({ targetRarity, matched }: { targetRarity: Rarity | null; matched: boolean }) {
  const color = targetRarity ? RARITY[targetRarity].color : LABEL
  return (
    <div
      className="flex aspect-square w-full flex-col items-center justify-center rounded-2xl p-4"
      style={{
        border: `2px solid ${matched ? color : BORDER}`,
        backgroundColor: CARD,
        minHeight: 180,
        opacity: matched ? 1 : 0.6,
      }}
    >
      <span className="text-[40px]" style={{ color }}>
        {targetRarity ? RARITY[targetRarity].symbol : "?"}
      </span>
      <p className="mt-3 text-center text-[13px] font-medium" style={{ color: matched ? "#FFFFFF" : LABEL }}>
        {targetRarity ? RARITY[targetRarity].label : "Результат"}
      </p>
      <p className="text-[11px]" style={{ color: LABEL }}>
        предпросмотр
      </p>
    </div>
  )
}

function Modal({ children, title, onClose }: { children: React.ReactNode; title: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl p-6"
        style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[18px] font-medium">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Закрыть" style={{ color: LABEL }}>
            <X size={18} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
