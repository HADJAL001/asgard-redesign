export default function Loading() {
  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6"
      style={{ backgroundColor: "#0A1128" }}
      role="status"
      aria-label="Загрузка"
    >
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
        NEW WORLD
      </p>
    </div>
  )
}
