"use client"

/* ================================================================
   ConfirmModal — переиспользуемое подтверждение необратимого действия
   ----------------------------------------------------------------
   Веб-аналог mobile/components/ui/ConfirmDialog.tsx (принцип 6 из
   инициативы "предельно понятный интерфейс": нельзя сломать необратимо
   без подтверждения человеческим языком последствий). Стилистика
   overlay/card повторяет существующие модалки (withdraw/deposit в
   wallet-view.tsx, confirm-модалка в transfer-view.tsx).

   message формулируется вызывающей стороной человеческим языком с
   конкретными числами ("Спишет 50 TimeCoin...", не "Вы уверены?").
   confirmLabel — само действие ("Потратить 50 TimeCoin"), не "ОК".
   ================================================================ */

import { AlertTriangle, Coins, Loader2, X } from "lucide-react"
import { COLORS } from "@/lib/economy"

export function ConfirmModal({
  open,
  onCancel,
  onConfirm,
  title,
  message,
  confirmLabel,
  cancelLabel,
  loading,
  danger,
}: {
  open: boolean
  onCancel: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmLabel: string
  cancelLabel: string
  loading?: boolean
  danger?: boolean
}) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.75)" }}
      onClick={(e) => { if (e.target === e.currentTarget && !loading) onCancel() }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
    >
      <div
        className="w-full max-w-md rounded-2xl p-6"
        style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className="flex size-8 shrink-0 items-center justify-center rounded-full border"
              style={{ borderColor: danger ? COLORS.red : COLORS.amber }}
            >
              {danger ? (
                <AlertTriangle size={16} color={COLORS.red} strokeWidth={1.75} />
              ) : (
                <Coins size={16} color={COLORS.amber} strokeWidth={1.75} />
              )}
            </div>
            <h2 id="confirm-modal-title" className="text-[17px] font-semibold">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-white/10"
            style={{ color: COLORS.label }}
            aria-label={cancelLabel}
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <p className="text-[14px] leading-relaxed" style={{ color: "rgba(255,255,255,0.85)" }}>
          {message}
        </p>

        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 rounded-lg py-3 text-[14px] disabled:cursor-not-allowed disabled:opacity-60"
            style={{ border: `1px solid ${COLORS.border}`, color: COLORS.text }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg py-3 text-[14px] font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
            style={{ backgroundColor: danger ? COLORS.red : COLORS.accent, color: danger ? "#FFFFFF" : COLORS.bg }}
          >
            {loading && <Loader2 size={15} className="animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
