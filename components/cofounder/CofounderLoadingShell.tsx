export function CofounderLoadingShell() {
  return (
    <main className="cofounder-deck ds-body" aria-busy="true" aria-label="Загрузка AI Cofounder">
      <section className="cofounder-hero ds-hull ds-glass" style={{ minHeight: 290 }}>
        <div style={{ display: "grid", gap: 16, width: "min(620px, 100%)" }}>
          <span className="ds-utility" style={{ color: "var(--ds-primary)", opacity: 0.72 }}>AI COFOUNDER / COMMAND DECK</span>
          <div className="cofounder-loading-bar" style={{ width: "min(420px, 80vw)", height: 64 }} />
          <div className="cofounder-loading-bar" style={{ width: "min(560px, 90vw)", height: 18 }} />
        </div>
      </section>
      <section className="cofounder-metrics" aria-hidden="true">
        {[0, 1, 2, 3].map((item) => <div key={item} className="ds-glass cofounder-loading-card" />)}
      </section>
      <section className="cofounder-grid" aria-hidden="true">
        <div className="ds-glass cofounder-loading-panel" />
        <div className="ds-glass cofounder-loading-panel" />
      </section>
      <style>{`
        .cofounder-loading-bar,.cofounder-loading-card,.cofounder-loading-panel{position:relative;overflow:hidden;background:color-mix(in srgb,var(--ds-surface) 72%,transparent);border:1px solid color-mix(in srgb,var(--ds-line) 70%,transparent)}
        .cofounder-loading-bar::after,.cofounder-loading-card::after,.cofounder-loading-panel::after{content:"";position:absolute;inset:0;transform:translateX(-100%);background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--ds-primary) 16%,transparent),transparent);animation:cofounder-loading-sweep 1.6s ease-in-out infinite}
        .cofounder-loading-card{height:104px}.cofounder-loading-panel{min-height:390px}
        @keyframes cofounder-loading-sweep{to{transform:translateX(100%)}}
        @media (prefers-reduced-motion:reduce){.cofounder-loading-bar::after,.cofounder-loading-card::after,.cofounder-loading-panel::after{animation:none;transform:none;opacity:.35}}
        @media (max-width:850px){.cofounder-loading-panel{min-height:280px}}
      `}</style>
    </main>
  )
}
