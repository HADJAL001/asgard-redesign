"use client"

/* ================================================================
   OSGARD · DevTopBar — шапка студии разработчика.
   ----------------------------------------------------------------
   Выделена из DevShell отдельным файлом, потому что её показывает не
   только оболочка /dev, но и Мастерская проекта: в режиме разработчика
   ProjectWorkspaceView рендерит эту шапку вместо 24-пунктового Navbar
   (см. components/project-workspace-view.tsx). Один источник правды —
   иначе две шапки студии разъедутся при первой же правке.

   Три элемента и ни одного лишнего: марка, тумблер звука, возврат в мир.
   Всё остальное на экране принадлежит задаче человека, а не платформе.
   ================================================================ */

import { Volume2, VolumeX, ArrowLeft } from "lucide-react"
import { useDevMode } from "@/lib/dev-mode"

export function DevTopBar({ children }: { children?: React.ReactNode }) {
  const { switchMode, transitioning, soundEnabled, toggleSound } = useDevMode()

  return (
    <header className="flex items-center justify-between gap-4 px-6 py-6 md:px-8">
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-[15px]"
          style={{
            border: "1px solid rgb(226 232 240 / 22%)",
            background: "rgb(226 232 240 / 8%)",
            color: "#E2E8F0",
          }}
        >
          ⌘
        </span>
        <span className="dev-title shrink-0 text-[15px] tracking-[0.14em]">OSGARD DEV</span>
        {/* Слот контекста экрана — например название проекта в Мастерской. */}
        {children}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={toggleSound}
          aria-pressed={soundEnabled}
          aria-label={
            soundEnabled
              ? "Выключить звук перехода между режимами"
              : "Включить звук перехода между режимами"
          }
          className="dev-btn dev-btn--ghost"
          style={{ padding: "9px 12px" }}
        >
          {soundEnabled ? (
            <Volume2 size={15} strokeWidth={1.75} aria-hidden="true" />
          ) : (
            <VolumeX size={15} strokeWidth={1.75} aria-hidden="true" />
          )}
          <span className="hidden sm:inline">Звук</span>
        </button>

        <button
          type="button"
          onClick={() => switchMode("world")}
          disabled={transitioning}
          className="dev-btn dev-btn--ghost"
          aria-label="Вернуться в мир OSGARD — режим с артефактами, биржей и Залом Славы"
        >
          <ArrowLeft size={15} strokeWidth={1.75} aria-hidden="true" />
          <span className="hidden sm:inline">В мир OSGARD</span>
        </button>
      </div>
    </header>
  )
}
