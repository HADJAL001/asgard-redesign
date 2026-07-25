/* ================================================================
   OSGARD · Sensory Signature — sound
   ----------------------------------------------------------------
   Короткие СИНТЕЗИРОВАННЫЕ тоны через Web Audio API — без тяжёлых
   аудио-ассетов (по образцу того, как lib/voice.service.ts работает
   со звуком напрямую, без файлов). Один ленивый AudioContext на
   вкладку; каждый «жест» — набор осцилляторов с мягкой огибающей,
   чтобы не было щелчков.

   Гейтинг (тумблер / reduced-motion) живёт ВЫШЕ, в
   hooks/useSignature.ts — здесь только воспроизведение. Все функции
   SSR-safe и no-op там, где Web Audio недоступен.
   ================================================================ */

/** Ключевые моменты, у которых есть звуковая «подпись». */
export type SignatureCue = "artifactBorn" | "rarityUp" | "streak" | "legendary"

type Blip = {
  /** Частота, Гц. */
  freq: number
  /** Старт относительно момента вызова, сек. */
  at: number
  /** Длительность, сек. */
  dur: number
  /** Форма волны. */
  type?: OscillatorType
  /** Пиковая громкость (0..1). Держим тихо — премиум не кричит. */
  peak?: number
}

/** Партитуры «подписи». Тихие, короткие, узнаваемые. */
const SCORES: Record<SignatureCue, Blip[]> = {
  // Рождение артефакта — мягкая восходящая кварта.
  artifactBorn: [
    { freq: 523.25, at: 0, dur: 0.16, type: "triangle", peak: 0.07 },
    { freq: 783.99, at: 0.09, dur: 0.22, type: "triangle", peak: 0.06 },
  ],
  // Рост редкости — светлый мажорный арпеджио-триплет.
  rarityUp: [
    { freq: 587.33, at: 0, dur: 0.12, type: "triangle", peak: 0.06 },
    { freq: 739.99, at: 0.08, dur: 0.12, type: "triangle", peak: 0.06 },
    { freq: 987.77, at: 0.16, dur: 0.24, type: "triangle", peak: 0.05 },
  ],
  // Веха стрика — тёплый одиночный колокол.
  streak: [
    { freq: 659.25, at: 0, dur: 0.32, type: "sine", peak: 0.08 },
    { freq: 1318.5, at: 0, dur: 0.18, type: "sine", peak: 0.025 },
  ],
  // Легендарка — насыщенный мерцающий аккорд с лёгким детюном.
  legendary: [
    { freq: 523.25, at: 0, dur: 0.5, type: "sine", peak: 0.06 },
    { freq: 659.25, at: 0.06, dur: 0.5, type: "sine", peak: 0.055 },
    { freq: 783.99, at: 0.12, dur: 0.55, type: "sine", peak: 0.05 },
    { freq: 1046.5, at: 0.2, dur: 0.45, type: "triangle", peak: 0.035 },
  ],
}

let ctx: AudioContext | null = null

/** Ленивая инициализация общего AudioContext. null — если Web Audio недоступен. */
function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  if (!ctx) {
    try {
      ctx = new Ctor()
    } catch {
      return null
    }
  }
  return ctx
}

export function isSoundSupported(): boolean {
  if (typeof window === "undefined") return false
  return !!(window.AudioContext || (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext)
}

/**
 * Воспроизводит звуковую «подпись» момента. Никакого гейтинга —
 * вызывать только через hooks/useSignature.ts, где учтены тумблер и
 * reduced-motion. No-op, если Web Audio недоступен.
 */
export function playCue(cue: SignatureCue): void {
  const audio = getCtx()
  if (!audio) return

  // Автоплей-политики браузеров: контекст мог остаться suspended до
  // первого жеста. Вызовы «подписи» идут из пользовательских действий,
  // так что resume() безопасен и обычно уже не нужен.
  if (audio.state === "suspended") {
    audio.resume().catch(() => {})
  }

  const now = audio.currentTime
  for (const b of SCORES[cue]) {
    const osc = audio.createOscillator()
    const gain = audio.createGain()
    osc.type = b.type ?? "sine"
    osc.frequency.value = b.freq

    const start = now + b.at
    const peak = b.peak ?? 0.06
    // Мягкая атака + экспоненциальный спад: без щелчков на старте/стопе.
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.linearRampToValueAtTime(peak, start + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + b.dur)

    osc.connect(gain).connect(audio.destination)
    osc.start(start)
    osc.stop(start + b.dur + 0.02)
  }
}
