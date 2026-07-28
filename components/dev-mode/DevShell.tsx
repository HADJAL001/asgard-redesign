"use client"

/* ================================================================
   OSGARD · DevShell — оболочка режима разработчика.
   ----------------------------------------------------------------
   Заменяет 24-пунктовый Navbar ровно тремя элементами: марка,
   возврат в мир, тумблер звука. Всё остальное на экране принадлежит
   задаче пользователя, а не платформе.

   Фон отдельно НЕ рисуется: глобальный AmbientBackdrop уже смонтирован
   в AppShell, а класс .dev-mode на <html> перекрашивает его в холодную
   сине-серебряную гамму (см. globals.css, блок DEV MODE).
   ================================================================ */

import { type ReactNode } from "react"
import { Volume2, VolumeX, ArrowLeft } from "lucide-react"
import { useDevMode } from "@/lib/dev-mode"

export function DevShell({ children }: { children: ReactNode }) {
  const { switchMode, transitioning, soundEnabled, toggleSound } = useDevMode()

  return (
    <div className="relative z-10 min-h-screen font-sans">
      <header className="mx-auto flex max-w-[1100px] items-center justify-between px-6 py-6 md:px-8">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex size-8 items-center justify-center rounded-lg text-[15px]"
            style={{
              border: "1px solid rgb(226 232 240 / 22%)",
              background: "rgb(226 232 240 / 8%)",
              color: "#E2E8F0",
            }}
          >
            ⌘
          </span>
          <span className="dev-title text-[15px] tracking-[0.14em]">OSGARD DEV</span>
        </div>

        <div className="flex items-center gap-2">
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
            В мир OSGARD
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[1100px] px-6 pb-24 md:px-8">{children}</main>
    </div>
  )
}
