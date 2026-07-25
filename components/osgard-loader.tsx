/* ================================================================
   OSGARD · Единый полноэкранный лоадер с логотипом
   ----------------------------------------------------------------
   Показывается и как route-level загрузка (app/loading.tsx), и как
   fallback динамических импортов страниц — чтобы при переходах между
   экранами НИКОГДА не мелькал пустой синий экран или текст «Загрузка…»,
   а всегда был фирменный логотип OSGARD на всю страницу.
   Использует keyframes spin/osgard-aura-pulse из globals.css.
   ================================================================ */

export function OsgardLoader({ label = "NEW WORLD" }: { label?: string }) {
  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6"
      style={{ backgroundColor: "#0A1128" }}
      role="status"
      aria-label="Загрузка"
    >
      {/* Мягкое золотое сияние-подложка */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute"
        style={{
          width: 420,
          height: 420,
          background: "radial-gradient(closest-side, rgba(201,168,76,0.12), transparent)",
          filter: "blur(20px)",
          animation: "osgard-aura-pulse 3.4s ease-in-out infinite",
        }}
      />
      <div className="relative flex items-center justify-center">
        <div
          className="absolute size-24 rounded-full"
          style={{
            border: "2px solid rgba(201,168,76,0.15)",
            borderTopColor: "#C9A84C",
            animation: "spin 1.1s linear infinite",
          }}
        />
        <div
          className="absolute size-24 rounded-full"
          style={{
            boxShadow: "0 0 30px 6px rgba(201,168,76,0.25)",
            animation: "osgard-aura-pulse 2.2s ease-in-out infinite",
          }}
        />
        <span
          className="text-[15px] font-semibold tracking-[0.18em]"
          style={{
            background: "linear-gradient(135deg, #C9A84C 0%, #E5D4A0 50%, #C9A84C 100%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
            filter: "drop-shadow(0 0 8px rgba(201,168,76,0.45))",
          }}
        >
          OSGARD
        </span>
      </div>
      <p className="text-[13px] font-light tracking-[0.28em]" style={{ color: "rgba(229,228,226,0.6)" }}>
        {label}
      </p>
    </div>
  )
}

/** Alias для fallback динамических импортов страниц. */
export const PageLoader = OsgardLoader
