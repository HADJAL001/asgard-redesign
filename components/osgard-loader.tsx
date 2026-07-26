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

import { PremiumBackground } from "@/components/premium-bg"
import { OsgardMark } from "@/components/osgard-mark"

export function OsgardLoader({ label = "NEW WORLD" }: { label?: string }) {
  return (
    <div
      className="osgard-loader-veil fixed inset-0 z-[100] flex items-center justify-center"
      role="status"
      aria-label="Загрузка"
    >
      <PremiumBackground variant="gold" />
      <div className="osgard-loader-decor relative z-10 flex flex-col items-center gap-6">
        <div className="relative flex items-center justify-center">
          <div aria-hidden="true" className="osgard-loader-halo absolute size-32 rounded-full" />
          <OsgardMark size={88} boxed={false} />
        </div>
        <p className="text-[13px] font-light tracking-[0.28em]" style={{ color: "rgba(229,228,226,0.6)" }}>
          {label}
        </p>
      </div>
    </div>
  )
}

/** Alias для fallback динамических импортов страниц. */
export const PageLoader = OsgardLoader
