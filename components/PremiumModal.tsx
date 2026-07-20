"use client"

/* ================================================================
   PremiumModal — базовая премиум-обёртка для модальных окон OSGARD
   ----------------------------------------------------------------
   Glassmorphism + неоновое свечение cyan/purple + fade+scale анимация.
   Без внешних зависимостей — только React portal + Tailwind.
   ================================================================ */

import { useEffect, useRef, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"

export interface PremiumModalProps {
  open: boolean
  onClose: () => void
  title?: string
  subtitle?: string
  icon?: ReactNode
  children: ReactNode
  /** Ширина панели, по умолчанию max-w-lg */
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl"
  /** Скрыть кнопку закрытия */
  hideClose?: boolean
}

const MAX_W: Record<NonNullable<PremiumModalProps["maxWidth"]>, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
}

export function PremiumModal({
  open,
  onClose,
  title,
  subtitle,
  icon,
  children,
  maxWidth = "lg",
  hideClose = false,
}: PremiumModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)

  /* Закрытие по Escape */
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [open, onClose])

  /* Блокировка скролла */
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden"
    else document.body.style.overflow = ""
    return () => { document.body.style.overflow = "" }
  }, [open])

  if (!open || typeof window === "undefined") return null

  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ animation: "pm-fade-in 0.25s ease-out both" }}
      onClick={(e) => { if (e.target === overlayRef.current) onClose() }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/75 backdrop-blur-xl" />

      {/* Neon ambient glow behind panel */}
      <div
        className="absolute pointer-events-none"
        style={{
          width: 600,
          height: 400,
          background: "radial-gradient(ellipse at center, rgba(6,182,212,0.15) 0%, rgba(168,85,247,0.1) 50%, transparent 70%)",
          filter: "blur(40px)",
          animation: "pm-fade-in 0.4s ease-out both",
        }}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className={`relative w-full ${MAX_W[maxWidth]} rounded-[28px] overflow-hidden`}
        style={{
          background: "rgba(9, 9, 18, 0.85)",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow:
            "0 0 0 1px rgba(6,182,212,0.12), 0 0 60px rgba(6,182,212,0.08), 0 0 120px rgba(168,85,247,0.06), 0 32px 64px rgba(0,0,0,0.6)",
          backdropFilter: "blur(32px) saturate(180%)",
          animation: "pm-scale-in 0.3s cubic-bezier(0.16,1,0.3,1) both",
        }}
      >
        {/* Top gradient line */}
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{ background: "linear-gradient(90deg, transparent, rgba(6,182,212,0.5) 30%, rgba(168,85,247,0.5) 70%, transparent)" }}
          aria-hidden="true"
        />

        {/* Close button */}
        {!hideClose && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 z-10 flex items-center justify-center w-8 h-8 rounded-full text-white/40 hover:text-white/80 transition-colors duration-200"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
            aria-label="Закрыть"
          >
            <X size={14} strokeWidth={2} />
          </button>
        )}

        {/* Header */}
        {(icon || title || subtitle) && (
          <div className="px-7 pt-7 pb-5 flex items-start gap-4">
            {icon && (
              <div
                className="shrink-0 flex items-center justify-center w-12 h-12 rounded-2xl"
                style={{
                  background: "linear-gradient(135deg, rgba(6,182,212,0.15), rgba(168,85,247,0.15))",
                  border: "1px solid rgba(6,182,212,0.2)",
                  boxShadow: "0 0 20px rgba(6,182,212,0.1)",
                }}
              >
                {icon}
              </div>
            )}
            <div className="min-w-0 flex-1 pr-8">
              {title && (
                <h2 className="text-[20px] font-semibold text-white tracking-[-0.02em] leading-tight">
                  {title}
                </h2>
              )}
              {subtitle && (
                <p className="mt-1 text-[13px] leading-relaxed" style={{ color: "rgba(255,255,255,0.45)" }}>
                  {subtitle}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Content */}
        <div className={title || icon ? "px-7 pb-7" : "p-7"}>
          {children}
        </div>

        {/* Bottom gradient line */}
        <div
          className="absolute bottom-0 left-0 right-0 h-px"
          style={{ background: "linear-gradient(90deg, transparent, rgba(168,85,247,0.3) 50%, transparent)" }}
          aria-hidden="true"
        />
      </div>

      <style>{`
        @keyframes pm-fade-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes pm-scale-in {
          from { opacity: 0; transform: scale(0.94) translateY(8px); }
          to   { opacity: 1; transform: scale(1)    translateY(0);   }
        }
      `}</style>
    </div>,
    document.body,
  )
}
