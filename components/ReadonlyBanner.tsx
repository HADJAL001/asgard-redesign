"use client"

/* ================================================================
   ReadonlyBanner — фиксированная полоска для режима просмотра
   ----------------------------------------------------------------
   Показывается только незарегистрированным пользователям.
   Прикреплена снизу экрана, над footer.
   ================================================================ */

import Link from "next/link"
import { Eye, ArrowRight, X } from "lucide-react"
import { useState } from "react"
import { useReadonlyMode } from "@/lib/readonly-mode"

export function ReadonlyBanner() {
  const { isReadonly } = useReadonlyMode()
  const [dismissed, setDismissed] = useState(false)

  if (!isReadonly || dismissed) return null

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[1000] flex items-center justify-between gap-3 px-4 py-3 sm:px-6"
      style={{
        background: "linear-gradient(135deg, rgba(9,9,18,0.97), rgba(14,14,28,0.97))",
        borderTop: "1px solid rgba(6,182,212,0.2)",
        backdropFilter: "blur(20px)",
        boxShadow: "0 -4px 40px rgba(6,182,212,0.08)",
      }}
      role="status"
      aria-live="polite"
    >
      {/* Левая часть — иконка + текст */}
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="shrink-0 flex items-center justify-center w-7 h-7 rounded-lg"
          style={{ background: "rgba(6,182,212,0.1)", border: "1px solid rgba(6,182,212,0.2)" }}
        >
          <Eye size={14} style={{ color: "#06B6D4" }} />
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-white truncate">
            Режим просмотра
          </p>
          <p className="text-[11px] truncate" style={{ color: "rgba(255,255,255,0.4)" }}>
            Зарегистрируйтесь чтобы создавать, торговать и зарабатывать
          </p>
        </div>
      </div>

      {/* Правая часть — CTA + закрыть */}
      <div className="flex items-center gap-2 shrink-0">
        <Link
          href="/register"
          className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[12px] font-semibold transition-all duration-200"
          style={{
            background: "linear-gradient(135deg, #06B6D4, #7C3AED)",
            color: "#fff",
            boxShadow: "0 0 20px rgba(6,182,212,0.25)",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)" }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)" }}
        >
          Регистрация <ArrowRight size={12} />
        </Link>

        <Link
          href="/login"
          className="inline-flex items-center rounded-xl px-3 py-2 text-[12px] font-medium transition-colors duration-200"
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)",
            color: "rgba(255,255,255,0.5)",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.85)" }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.5)" }}
        >
          Войти
        </Link>

        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors duration-200"
          style={{ color: "rgba(255,255,255,0.3)" }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.6)" }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.3)" }}
          aria-label="Скрыть баннер"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  )
}
