"use client"

/* ================================================================
   OSGARD · SnakeBackground — пиксельная змея «ходит» по фону
   ----------------------------------------------------------------
   Декоративный фон раздела Оркестратор: пиксельная змея неспешно
   ползёт по экрану (горизонтальный проход + вертикальная синус-волна
   тела), на голове — ярлык «OS AI Python» (имя оркестратора).
   Чистый CSS, приглушённая (не перекрывает контент). Рендерится за
   контентом; контент оборачивай в relative z-10.
   ================================================================ */

const SEGMENTS = 16
const PY_BLUE = "#4B8BBE" // фирменные цвета Python
const PY_YELLOW = "#FFD343"

const CSS = `
@keyframes snake-cross { 0% { left: -18%; } 100% { left: 108%; } }
@keyframes snake-wave { 0%,100% { transform: translateY(-14px); } 50% { transform: translateY(14px); } }
.snake-root { position: absolute; inset: 0; z-index: 0; overflow: hidden; pointer-events: none; }
.snake-track { position: absolute; top: 46%; left: -18%; display: flex; align-items: center; gap: 6px;
  animation: snake-cross 26s linear infinite; opacity: 0.5; }
.snake-seg { width: 16px; height: 16px; border-radius: 3px; will-change: transform;
  animation: snake-wave 2.4s ease-in-out infinite; box-shadow: 0 0 8px currentColor; }
.snake-label { margin-left: 10px; font-family: ui-monospace, Menlo, monospace; font-weight: 700;
  font-size: 15px; letter-spacing: .08em; color: ${PY_YELLOW}; white-space: nowrap;
  text-shadow: 0 0 10px rgba(255,211,67,0.5); animation: snake-wave 2.4s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .snake-track { animation-duration: 90s; } .snake-seg, .snake-label { animation: none; } }
`

export function SnakeBackground() {
  return (
    <div className="snake-root" aria-hidden="true">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="snake-track">
        {/* Голова */}
        <div
          className="snake-seg"
          style={{ width: 22, height: 22, background: PY_YELLOW, color: PY_YELLOW, animationDelay: "0s", position: "relative" }}
        >
          {/* глаз */}
          <span style={{ position: "absolute", top: 5, right: 5, width: 4, height: 4, borderRadius: 99, background: "#0b1020" }} />
        </div>
        {Array.from({ length: SEGMENTS }).map((_, i) => (
          <div
            key={i}
            className="snake-seg"
            style={{
              background: i % 4 === 0 ? PY_YELLOW : PY_BLUE,
              color: i % 4 === 0 ? PY_YELLOW : PY_BLUE,
              // хвост сужается
              width: 16 - Math.min(8, Math.floor(i / 3)),
              height: 16 - Math.min(8, Math.floor(i / 3)),
              animationDelay: `${-(i + 1) * 0.14}s`,
            }}
          />
        ))}
        <span className="snake-label">OS AI Python</span>
      </div>
    </div>
  )
}
