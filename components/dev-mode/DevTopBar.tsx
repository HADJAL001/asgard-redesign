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

import { Volume2, VolumeX, ArrowLeft, ArrowUp } from "lucide-react"
import { usePathname } from "next/navigation"
import { useDevMode, DEV_MODE_ROUTE } from "@/lib/dev-mode"

export function DevTopBar({ children }: { children?: React.ReactNode }) {
  const { switchMode, transitioning, soundEnabled, toggleSound, modeChosen } = useDevMode()

  /* Студия теперь вход по умолчанию — значит человек попадает сюда, ни о чём
     не спрашивая, и может не догадаться, что вторая вселенная вообще есть.
     Пока он ни разу не переключался, рядом с кнопкой висит подсказка.
     Исчезает навсегда после первого переключения (modeChosen) — подсказка,
     которую нельзя выключить, превращается в раздражитель.

     В Мастерской НЕ показываем: там своя плотная шапка («Скачать ZIP»,
     «Задеплоить»), и всплывающая подсказка наезжала на кнопки — проверено
     на живом стенде. Человек, дошедший до кода, уже освоился в студии. */
  const pathname = usePathname() || ""
  const isWorkshop = pathname.startsWith(`${DEV_MODE_ROUTE}/workspace/`)
  const showHint = !modeChosen && !transitioning && !isWorkshop

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

        <div className="relative">
          {showHint ? (
            <span className="dev-hint" role="note">
              {/* Стрелка ПЕРЕД текстом и смотрит вверх — прямо на кнопку над
                  ней. Иначе указывает мимо: подсказка висит под кнопкой. */}
              <ArrowUp size={16} strokeWidth={2} aria-hidden="true" className="dev-hint__arrow" />
              {/* Без перечисления разделов мира: во-первых, короче и понятнее,
                  во-вторых, их названия — маркеры экономики, которые ищет
                  scripts/dev-mode-leak-check.mjs. Перечисление в подсказке
                  делало проверку слепой к настоящим утечкам. */}
              <span className="dev-hint__text">Нажмите, чтобы перейти в основной OSGARD</span>
            </span>
          ) : null}

          <button
            type="button"
            onClick={() => switchMode("world")}
            disabled={transitioning}
            className={`dev-btn ${showHint ? "dev-btn--beacon" : "dev-btn--ghost"}`}
            aria-label="Перейти в основной режим OSGARD со всеми разделами платформы"
          >
            <ArrowLeft size={15} strokeWidth={1.75} aria-hidden="true" />
            <span className="hidden sm:inline">В мир OSGARD</span>
          </button>
        </div>
      </div>
    </header>
  )
}
