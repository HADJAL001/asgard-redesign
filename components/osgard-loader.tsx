"use client"

/* ================================================================
   OSGARD · Единый полноэкранный лоадер с логотипом
   ----------------------------------------------------------------
   Показывается и как route-level загрузка (app/loading.tsx), и как
   fallback динамических импортов страниц — чтобы при переходах между
   экранами НИКОГДА не мелькал пустой синий экран или текст «Загрузка…»,
   а всегда был фирменный логотип OSGARD на всю страницу.
   Переиспользует существующие премиум-примитивы: PremiumBackground
   (денежный фон, components/premium-bg.tsx) и OsgardMark (гравированный
   золотой знак ∞, components/osgard-mark.tsx — тот же, что на входе/
   регистрации). Декор (знак+ореол+подпись) появляется с небольшой
   задержкой (.osgard-loader-decor в globals.css), чтобы не мигать на
   быстрых переходах между страницами.
   ================================================================ */

import { useEffect, useState, type CSSProperties } from "react"

const LOAD_STEPS = [
  "Инициализация ядра...",
  "Загрузка нейронных связей...",
  "Проверка целостности TimeCoin...",
  "Синхронизация с OSGARD 5.0...",
]

export function OsgardLoader({ label = "NEW WORLD" }: { label?: string }) {
  const [step, setStep] = useState(0)

  useEffect(() => {
    const interval = window.setInterval(() => setStep((current) => (current + 1) % LOAD_STEPS.length), 500)
    return () => window.clearInterval(interval)
  }, [])

  return (
    <div
      className="osgard-loader-veil fixed inset-0 z-[100] flex items-center justify-center"
      role="status"
      aria-label="Загрузка"
    >
      <div className="osgard-loader-warp" aria-hidden="true">
        {Array.from({ length: 18 }, (_, index) => <i key={index} style={{ "--warp-delay": `${(index % 6) * -0.38}s`, "--warp-angle": `${index * 20}deg` } as CSSProperties} />)}
      </div>
      <div className="osgard-loader-decor relative z-10 flex flex-col items-center gap-3">
        <div className="osgard-loader-wordmark">OSGARD</div>
        <p className="osgard-loader-status" aria-live="polite">{LOAD_STEPS[step]}</p>
        <div className="osgard-loader-progress" aria-hidden="true"><i /></div>
        <p className="osgard-loader-label">{label}</p>
      </div>
    </div>
  )
}

/** Alias для fallback динамических импортов страниц. */
export const PageLoader = OsgardLoader
