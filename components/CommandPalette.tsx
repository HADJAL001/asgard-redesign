"use client"

/* ================================================================
   CommandPalette — Ctrl/Cmd+K быстрый переход по разделам
   ================================================================ */

import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import { Search } from "lucide-react"
import { NAV } from "./navbar"
import { useTranslation } from "@/lib/i18n/use-translation"

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter()
  const { t } = useTranslation()
  const [query, setQuery] = useState("")
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const items = useMemo(
    () => NAV.map((item) => ({ ...item, label: t(item.key) })),
    [t],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((item) => item.label.toLowerCase().includes(q))
  }, [items, query])

  useEffect(() => {
    if (open) {
      setQuery("")
      setActiveIndex(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose()
      } else if (e.key === "ArrowDown") {
        e.preventDefault()
        setActiveIndex((i) => Math.min(i + 1, filtered.length - 1))
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        setActiveIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === "Enter") {
        e.preventDefault()
        const target = filtered[activeIndex]
        if (target) {
          router.push(target.href)
          onClose()
        }
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [open, filtered, activeIndex, onClose, router])

  if (!open || typeof window === "undefined") return null

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-start justify-center pt-[15vh] p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal="true"
      aria-label="Быстрый переход"
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-xl" />

      <div
        className="relative w-full max-w-[540px] overflow-hidden rounded-2xl"
        style={{
          background: "rgba(9,9,18,0.92)",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 0 0 1px rgba(6,182,212,0.12), 0 32px 64px rgba(0,0,0,0.6)",
          backdropFilter: "blur(32px) saturate(180%)",
        }}
      >
        <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: "1px solid #2A2A3E" }}>
          <Search size={18} strokeWidth={1.75} style={{ color: "#6A6A8A" }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Куда перейти?"
            className="w-full bg-transparent text-[15px] outline-none placeholder:text-white/30"
            style={{ color: "#FFFFFF" }}
          />
          <kbd className="rounded px-1.5 py-0.5 text-[11px]" style={{ color: "#6A6A8A", border: "1px solid #2A2A3E" }}>
            Esc
          </kbd>
        </div>

        <div className="max-h-[320px] overflow-y-auto p-2">
          {filtered.length === 0 && (
            <p className="px-3 py-6 text-center text-[13px]" style={{ color: "#6A6A8A" }}>
              Ничего не найдено
            </p>
          )}
          {filtered.map((item, i) => {
            const Icon = item.Icon
            const active = i === activeIndex
            return (
              <button
                key={item.key}
                type="button"
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => {
                  router.push(item.href)
                  onClose()
                }}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[14px] transition-colors"
                style={{
                  backgroundColor: active ? "rgba(0,212,255,0.1)" : "transparent",
                  color: active ? "#00D4FF" : "rgba(255,255,255,0.8)",
                }}
              >
                <Icon size={16} strokeWidth={1.5} style={{ color: active ? "#00D4FF" : "#6A6A8A" }} />
                {item.label}
              </button>
            )
          })}
        </div>
      </div>
    </div>,
    document.body,
  )
}
