"use client"

/* ================================================================
   OSGARD · Dev Mode — «две вселенные» в одной платформе.
   ----------------------------------------------------------------
   Два режима с ОДНИМ и тем же ядром (проекты, агенты, генерация):

   • "world" — основной режим OSGARD: артефакты, TimeCoin, биржа,
     Зал Славы, рейтинги. Ничего из этого здесь не меняется.
   • "dev"   — минималистичная студия разработки: только создание
     проекта, голос, агенты, код. Экономический контур не показывается.

   Архитектура намеренно «слой поверх», а не сквозная фильтрация:
   существующие экраны (forge-view, wallet-view, marketplace-view …)
   НЕ знают про режим и не правятся вообще. Dev Mode живёт на своём
   роуте /dev со своей оболочкой. Поэтому обычный режим физически не
   может измениться из-за этого кода — важное свойство для прода.

   SSR: начальное значение всегда "world", реальное читается из
   localStorage в useEffect после монтирования. Иначе разметка сервера
   разойдётся с клиентской и Next.js выдаст ошибку гидратации.
   ================================================================ */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { useRouter, usePathname } from "next/navigation"
import { playModeSwitchSound } from "./dev-mode-sound"
import { useAuth } from "./auth-store"

export type OsgardMode = "world" | "dev"

/** Роут студии разработчика. /developer уже занят API-ключами,
 *  /studio — гостевой песочницей лендинга, поэтому /dev. */
export const DEV_MODE_ROUTE = "/dev"

/** Куда возвращает выход из студии: рабочий контур, а не главная с
 *  экономикой — человек возвращается к своим проектам. */
export const WORLD_MODE_ROUTE = "/projects"

const STORAGE_KEY_MODE = "osgard_mode"
const STORAGE_KEY_SOUND = "osgard_mode_sound"

/** Длительность киношного перехода. Держим в одном месте: этим же
 *  значением синхронизируются CSS-анимации (см. globals.css, блок
 *  .dev-mode-transition) и момент фактической смены режима. */
export const TRANSITION_MS = 1500

type DevModeContextValue = {
  /** Текущий режим. До монтирования на клиенте — всегда "world". */
  mode: OsgardMode
  /** Идёт ли сейчас переход между режимами (для блокировки повторных кликов). */
  transitioning: boolean
  /** Звук трансформации. По умолчанию ВЫКЛ: автозвук раздражает и
   *  блокируется браузерами без пользовательского жеста. */
  soundEnabled: boolean
  toggleSound: () => void
  /** Переключить режим с киношным переходом. */
  switchMode: (next: OsgardMode) => void
  /** Прочитано ли состояние из localStorage (нужно, чтобы не мигать UI). */
  hydrated: boolean
  /** Переключал ли человек режим сам. false — значит он тут впервые и ещё
   *  не знает про вторую вселенную: показываем стрелку-подсказку. */
  modeChosen: boolean
}

const DevModeContext = createContext<DevModeContextValue | null>(null)

function readStored<T extends string>(key: string, allowed: readonly T[]): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw && (allowed as readonly string[]).includes(raw) ? (raw as T) : null
  } catch {
    // localStorage недоступен (приватный режим, отключённые куки) — не падаем,
    // просто работаем с дефолтом. Тот же приём, что в lib/use-adaptive-label.ts.
    return null
  }
}

function writeStored(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Сохранение не критично: режим доживёт до перезагрузки страницы.
  }
}

export function DevModeProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [mode, setMode] = useState<OsgardMode>("world")
  const [soundEnabled, setSoundEnabled] = useState(false)
  const [transitioning, setTransitioning] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  /* Выбирал ли человек режим сам. Отличать «не выбирал» от «выбрал мир»
     обязательно: студия — вход по умолчанию, но осознанный выбор мира
     мы обязаны уважать, иначе человека будет выкидывать из мира при
     каждом заходе на главную. */
  const [modeChosen, setModeChosen] = useState(false)

  /* Авторизован ли человек. AuthProvider смонтирован в app/layout.tsx
     СНАРУЖИ AppShell, поэтому хук здесь доступен. Нужен для того, чтобы
     вход по умолчанию срабатывал только для своих: гость должен видеть
     лендинг, а не студию. */
  const { isAuthenticated } = useAuth()

  // Восстановление состояния — строго после монтирования (см. заголовок про SSR).
  useEffect(() => {
    const storedMode = readStored<OsgardMode>(STORAGE_KEY_MODE, ["world", "dev"])
    if (storedMode) {
      setMode(storedMode)
      setModeChosen(true)
    }
    setSoundEnabled(readStored(STORAGE_KEY_SOUND, ["on", "off"]) === "on")
    setHydrated(true)
  }, [])

  /* ── Студия как вход по умолчанию ──
     Директива основателя: «стиль разработчика должен быть по умолчанию».
     Поэтому первый заход на рабочий контур платформы ведёт в студию —
     но ровно один раз и только с корневых экранов входа. Уводить с
     произвольной страницы нельзя: человек, открывший ссылку на Кузницу,
     должен попасть в Кузницу, а не в студию.

     Дальше выбор запоминается: нажал «Мир OSGARD» — больше сюда не
     возвращаем (см. modeChosen). */
  const redirectedToStudio = useRef(false)
  useEffect(() => {
    if (!hydrated || transitioning || modeChosen || redirectedToStudio.current) return
    /* Гостя не трогаем вообще: «/» — это лендинг, он рассказывает про
       платформу и ведёт к регистрации. Проверка на живом стенде показала,
       что автоперенос встречал незнакомого человека пустой студией вместо
       рассказа о продукте. Вход по умолчанию — для того, кто пришёл
       работать, а не для случайного посетителя. */
    if (!isAuthenticated) return

    const isEntryPoint = pathname === "/" || pathname === WORLD_MODE_ROUTE
    if (!isEntryPoint) return
    redirectedToStudio.current = true
    setMode("dev")
    router.replace(DEV_MODE_ROUTE)
  }, [hydrated, transitioning, modeChosen, pathname, router, isAuthenticated])

  /* Роут — сильнейший источник правды о режиме, сильнее localStorage.
     Найдено живой проверкой: при заходе на /dev по прямой ссылке (или
     после F5, или в новой вкладке) хранилище пустое, режим оставался
     "world" — и человек видел студию ВМЕСТЕ с подвалом мира: Кузница,
     Маркет, Биржа, Кошелёк, Зал Славы. То есть весь экономический контур,
     который режим обязан убирать.

     Синхронизация здесь, а не в switchMode: переключателем режим меняют
     не всегда — на /dev можно прийти ссылкой, закладкой или «назад». */
  const inDevRoute = pathname === DEV_MODE_ROUTE || pathname?.startsWith(`${DEV_MODE_ROUTE}/`)
  useEffect(() => {
    if (!hydrated || transitioning) return
    const routeMode: OsgardMode = inDevRoute ? "dev" : "world"
    // Правим только реальное расхождение — иначе лишний рендер на каждой навигации.
    if (routeMode === "dev" && mode !== "dev") {
      setMode("dev")
      /* В хранилище НЕ пишем: нахождение на /dev само по себе не выбор
         человека — сюда мог привести автоперенос по умолчанию. Записывает
         только switchMode, то есть явное нажатие кнопки. Иначе первый же
         автоперенос «застывал» бы как решение и стрелка-подсказка
         исчезала, ни разу не показавшись. */
    }
  }, [inDevRoute, hydrated, transitioning, mode])

  /* Класс на <html> — им CSS переключает палитру всей страницы (globals.css)
     и прячет глобальный серверный футер (правило `.dev-mode footer`).
     Вешаем именно на documentElement, а не на body: body каждый рендер
     пересоздаётся Next.js-ом со своим className из layout.tsx.

     Условие — режим ИЛИ роут: во время перехода состояние ещё не сменилось,
     но человек уже на /dev, и подвал мира не должен успеть мигнуть. */
  useEffect(() => {
    if (!hydrated) return
    document.documentElement.classList.toggle("dev-mode", mode === "dev" || Boolean(inDevRoute))
  }, [mode, hydrated, inDevRoute])

  useEffect(() => {
    const pending = timers.current
    return () => {
      pending.forEach(clearTimeout)
    }
  }, [])

  const toggleSound = useCallback(() => {
    setSoundEnabled((prev) => {
      const next = !prev
      writeStored(STORAGE_KEY_SOUND, next ? "on" : "off")
      return next
    })
  }, [])

  const switchMode = useCallback(
    (next: OsgardMode) => {
      // Ранний выход — ТОЛЬКО пока играет переход. Сверять `next === mode`
      // здесь нельзя: состояние режима и фактический роут могут разойтись
      // (человек ушёл из студии по прямой ссылке/кнопкой «назад», а в
      // localStorage осталось "dev"). Тогда кнопка молча переставала
      // работать — клик есть, реакции нет. Целевой роут проверяем ниже.
      if (transitioning) return

      const targetRoute = next === "dev" ? DEV_MODE_ROUTE : WORLD_MODE_ROUTE
      // Уже и в нужном режиме, и на нужном экране — делать нечего.
      if (next === mode && pathname === targetRoute) return

      const reduceMotion =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches

      const commit = () => {
        setMode(next)
        writeStored(STORAGE_KEY_MODE, next)
        /* Человек выбрал сам — автоперенос в студию больше не срабатывает.
           Без этого нажатие «Мир OSGARD» отменялось бы автопереходом. */
        setModeChosen(true)
        // В "dev" уводим на студию; из "dev" — на рабочий контур, а не на
        // главную с экономикой: человек возвращается к своим проектам.
        router.push(targetRoute)
      }

      // Доступность: при prefers-reduced-motion эффект пропускается целиком.
      if (reduceMotion) {
        commit()
        return
      }

      setTransitioning(true)
      if (soundEnabled) {
        // Вызов внутри обработчика клика — иначе браузер заблокирует AudioContext.
        playModeSwitchSound(next)
      }

      // Режим меняется в «слепой» середине перехода (экран уже погашен),
      // поэтому подмена интерфейса не видна как скачок.
      timers.current.push(setTimeout(commit, TRANSITION_MS * 0.55))
      timers.current.push(setTimeout(() => setTransitioning(false), TRANSITION_MS))
    },
    [mode, transitioning, soundEnabled, router, pathname],
  )

  const value = useMemo<DevModeContextValue>(
    () => ({ mode, transitioning, soundEnabled, toggleSound, switchMode, hydrated, modeChosen }),
    [mode, transitioning, soundEnabled, toggleSound, switchMode, hydrated, modeChosen],
  )

  return <DevModeContext.Provider value={value}>{children}</DevModeContext.Provider>
}

export function useDevMode(): DevModeContextValue {
  const ctx = useContext(DevModeContext)
  if (!ctx) {
    throw new Error("useDevMode должен вызываться внутри <DevModeProvider> (см. components/AppShell.tsx)")
  }
  return ctx
}
