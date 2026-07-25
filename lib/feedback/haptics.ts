/* ================================================================
   OSGARD · Sensory Signature — haptics
   ----------------------------------------------------------------
   Тонкая обёртка над navigator.vibrate. No-op там, где не
   поддерживается (десктоп, iOS Safari) — вызывающий код не должен
   проверять поддержку сам. Гейтинг (тумблер / reduced-motion) —
   выше, в hooks/useSignature.ts.
   ================================================================ */

import type { SignatureCue } from "./sound"

/** Вибро-паттерны в мс (число — одиночный импульс, массив — импульс/пауза/…). */
const PATTERNS: Record<SignatureCue, number | number[]> = {
  artifactBorn: 18,
  rarityUp: [12, 40, 22],
  streak: 24,
  legendary: [20, 50, 20, 50, 40],
}

export function isVibrationSupported(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function"
}

/** Проигрывает тактильную «подпись» момента. Тихо no-op, если вибро недоступно. */
export function vibrateCue(cue: SignatureCue): void {
  if (!isVibrationSupported()) return
  try {
    navigator.vibrate(PATTERNS[cue])
  } catch {
    /* некоторые движки бросают на нестандартных паттернах — игнорируем */
  }
}
