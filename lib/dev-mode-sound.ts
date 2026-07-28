/* ================================================================
   OSGARD · Звук трансформации режима — чистый синтез Web Audio.
   ----------------------------------------------------------------
   Ноль ассетов в бандле: гул и свип генерируются осцилляторами прямо
   в браузере. Это дешевле любого .mp3 и не тянет сеть.

   Дисциплина:
   • Вызывать ТОЛЬКО из обработчика пользовательского жеста (клик) —
     иначе браузеры блокируют AudioContext autoplay-политикой.
   • По умолчанию звук выключен (см. lib/dev-mode.tsx), это осознанный
     выбор: неожиданный звук раздражает и мешает скринридерам.
   • Всё в try/catch — на отсутствие Web Audio реагируем тишиной,
     а не падением интерфейса.
   ================================================================ */

type AudioContextCtor = typeof AudioContext

function getAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === "undefined") return null
  return (
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext ??
    null
  )
}

/**
 * Звук перехода между режимами: низкий гул «выключения системы»
 * плюс свип, направление которого зависит от того, куда мы идём.
 *
 * dev   — свип ВВЕРХ («загрузка студии», собранная система)
 * world — свип ВНИЗ («возврат в мир», распад технического слоя)
 */
export function playModeSwitchSound(target: "world" | "dev"): void {
  const Ctor = getAudioContextCtor()
  if (!Ctor) return

  try {
    const ctx = new Ctor()
    const now = ctx.currentTime
    const master = ctx.createGain()
    // Общая громкость намеренно низкая: эффект должен подчёркивать
    // переход, а не перекрикивать музыку/видео пользователя.
    master.gain.setValueAtTime(0.0001, now)
    master.gain.exponentialRampToValueAtTime(0.18, now + 0.12)
    master.gain.exponentialRampToValueAtTime(0.0001, now + 1.45)
    master.connect(ctx.destination)

    // ── Слой 1: низкий гул. Пила через мягкий lowpass = «тело» звука.
    const humOsc = ctx.createOscillator()
    const humFilter = ctx.createBiquadFilter()
    const humGain = ctx.createGain()
    humOsc.type = "sawtooth"
    humOsc.frequency.setValueAtTime(42, now)
    humOsc.frequency.exponentialRampToValueAtTime(28, now + 1.4)
    humFilter.type = "lowpass"
    humFilter.frequency.setValueAtTime(220, now)
    humFilter.Q.value = 6
    humGain.gain.setValueAtTime(0.9, now)
    humGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.4)
    humOsc.connect(humFilter).connect(humGain).connect(master)

    // ── Слой 2: свип «перезагрузки системы».
    const sweepOsc = ctx.createOscillator()
    const sweepGain = ctx.createGain()
    sweepOsc.type = "triangle"
    const [from, to] = target === "dev" ? [180, 1250] : [1100, 160]
    sweepOsc.frequency.setValueAtTime(from, now + 0.28)
    sweepOsc.frequency.exponentialRampToValueAtTime(to, now + 1.15)
    sweepGain.gain.setValueAtTime(0.0001, now)
    sweepGain.gain.setValueAtTime(0.0001, now + 0.28)
    sweepGain.gain.exponentialRampToValueAtTime(0.5, now + 0.55)
    sweepGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.3)
    sweepOsc.connect(sweepGain).connect(master)

    humOsc.start(now)
    sweepOsc.start(now)
    humOsc.stop(now + 1.5)
    sweepOsc.stop(now + 1.5)

    // Освобождаем аудио-железо: без close() каждый переход оставляет
    // висящий AudioContext, а их число в браузере ограничено.
    window.setTimeout(() => {
      void ctx.close().catch(() => {})
    }, 1700)
  } catch {
    // Web Audio недоступен или заблокирован — молча остаёмся без звука.
  }
}
