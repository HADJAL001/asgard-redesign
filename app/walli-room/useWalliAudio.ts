'use client'

import { useRef, useCallback } from 'react'

// ─── Web Audio API хук для ВАЛЛИ ─────────────────────────────────────────────
export function useWalliAudio() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctxRef = useRef<any>(null)

  // Ленивая инициализация AudioContext (требует пользовательского жеста)
  const getCtx = useCallback((): AudioContext | null => {
    if (typeof window === 'undefined') return null
    if (!ctxRef.current) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const AC = (window as any).AudioContext || (window as any).webkitAudioContext
        if (AC) ctxRef.current = new AC()
      } catch {
        return null
      }
    }
    return ctxRef.current
  }, [])

  // ── Утилита: синтезировать тон ────────────────────────────────────────────
  const playTone = useCallback((
    freq: number,
    type: OscillatorType,
    duration: number,
    volume = 0.15,
    startDelay = 0,
  ) => {
    const ctx = getCtx()
    if (!ctx) return

    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.type = type
    osc.frequency.setValueAtTime(freq, ctx.currentTime + startDelay)

    gain.gain.setValueAtTime(0, ctx.currentTime + startDelay)
    gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + startDelay + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startDelay + duration)

    osc.start(ctx.currentTime + startDelay)
    osc.stop(ctx.currentTime + startDelay + duration)
  }, [getCtx])

  // ── 1. Шаги ВАЛЛИ — бип-бип ───────────────────────────────────────────────
  const playStep = useCallback(() => {
    playTone(440, 'square', 0.06, 0.08)
    playTone(330, 'square', 0.06, 0.06, 0.07)
  }, [playTone])

  // ── 2. Сбор мусора — восходящий чирп ─────────────────────────────────────
  const playCollect = useCallback(() => {
    const ctx = getCtx()
    if (!ctx) return

    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.type = 'sine'
    osc.frequency.setValueAtTime(300, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(900, ctx.currentTime + 0.25)

    gain.gain.setValueAtTime(0.2, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)

    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.3)

    // Короткий подтверждающий бип
    playTone(880, 'sine', 0.08, 0.15, 0.28)
  }, [getCtx, playTone])

  // ── 3. Клик на ВАЛЛИ — дружелюбный звук ──────────────────────────────────
  const playGreet = useCallback(() => {
    playTone(523, 'sine', 0.12, 0.18)        // C5
    playTone(659, 'sine', 0.12, 0.18, 0.13)  // E5
    playTone(784, 'sine', 0.15, 0.2,  0.26)  // G5
  }, [playTone])

  // ── Очистка ───────────────────────────────────────────────────────────────
  const dispose = useCallback(() => {
    ctxRef.current?.close()
    ctxRef.current = null
  }, [])

  return { playStep, playCollect, playGreet, dispose }
}
