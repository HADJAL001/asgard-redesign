"use client"

/* ================================================================
   HotkeysHelpModal — справка по горячим клавишам (Ctrl/Cmd+/)
   ================================================================ */

import { Keyboard } from "lucide-react"
import { PremiumModal } from "./PremiumModal"

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)
const MOD = isMac ? "⌘" : "Ctrl"

const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: [MOD, "K"], label: "Быстрый переход по разделам" },
  { keys: [MOD, "N"], label: "Создать новый пост" },
  { keys: [MOD, "S"], label: "Сохранить (в открытой форме)" },
  { keys: [MOD, "/"], label: "Показать эту справку" },
]

function KeyCap({ children }: { children: string }) {
  return (
    <kbd
      className="inline-flex min-w-[28px] items-center justify-center rounded-md px-2 py-1 text-[12px] font-medium"
      style={{ backgroundColor: "#0A0A0F", border: "1px solid #2A2A3E", color: "#FFFFFF" }}
    >
      {children}
    </kbd>
  )
}

export function HotkeysHelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <PremiumModal
      open={open}
      onClose={onClose}
      title="Горячие клавиши"
      subtitle="Ускоряют навигацию по OSGARD"
      icon={<Keyboard size={22} strokeWidth={1.75} style={{ color: "#00D4FF" }} />}
      maxWidth="sm"
    >
      <div className="flex flex-col gap-3">
        {SHORTCUTS.map((s) => (
          <div key={s.label} className="flex items-center justify-between">
            <span className="text-[14px]" style={{ color: "rgba(255,255,255,0.75)" }}>{s.label}</span>
            <div className="flex items-center gap-1">
              {s.keys.map((k, i) => (
                <span key={i} className="flex items-center gap-1">
                  <KeyCap>{k}</KeyCap>
                  {i < s.keys.length - 1 && <span style={{ color: "#6A6A8A" }}>+</span>}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </PremiumModal>
  )
}
