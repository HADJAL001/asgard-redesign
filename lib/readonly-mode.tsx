"use client"

/* ================================================================
   OSGARD · Readonly Mode
   ----------------------------------------------------------------
   Позволяет незарегистрированным пользователям смотреть платформу,
   но блокирует любые действия (кнопки, формы).

   Использование:
     const { isReadonly, triggerPaywall } = useReadonlyMode()

     <button
       onClick={isReadonly ? triggerPaywall : doAction}
       className={isReadonly ? "opacity-50 cursor-not-allowed" : ""}
     >

   Или через компонент-обёртку:
     <ReadonlyGate action="Создать артефакт">
       <button onClick={doAction}>Создать</button>
     </ReadonlyGate>
   ================================================================ */

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react"
import { useAuth } from "./auth-store"

/* ---- Контекст ---- */
interface ReadonlyModeValue {
  /** true если пользователь не авторизован */
  isReadonly: boolean
  /** Показывает paywall-модалку с описанием что заблокировано */
  triggerPaywall: (actionLabel?: string) => void
  /** Текущее заблокированное действие (для модалки) */
  blockedAction: string | null
  /** Закрыть paywall */
  closePaywall: () => void
  isPaywallOpen: boolean
}

const ReadonlyModeContext = createContext<ReadonlyModeValue | null>(null)

export function ReadonlyModeProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth()
  const [blockedAction, setBlockedAction] = useState<string | null>(null)
  const [isPaywallOpen, setIsPaywallOpen] = useState(false)

  const triggerPaywall = useCallback((actionLabel?: string) => {
    setBlockedAction(actionLabel || null)
    setIsPaywallOpen(true)
  }, [])

  const closePaywall = useCallback(() => {
    setIsPaywallOpen(false)
    setBlockedAction(null)
  }, [])

  return (
    <ReadonlyModeContext.Provider
      value={{
        isReadonly: !isAuthenticated,
        triggerPaywall,
        blockedAction,
        closePaywall,
        isPaywallOpen,
      }}
    >
      {children}
    </ReadonlyModeContext.Provider>
  )
}

export function useReadonlyMode(): ReadonlyModeValue {
  const ctx = useContext(ReadonlyModeContext)
  if (!ctx) throw new Error("useReadonlyMode must be used within ReadonlyModeProvider")
  return ctx
}

/* ----------------------------------------------------------------
   ReadonlyGate — обёртка для интерактивных элементов.
   Перехватывает клики и показывает paywall если isReadonly.
   ---------------------------------------------------------------- */
interface ReadonlyGateProps {
  children: ReactNode
  /** Описание действия для paywall ("Создать артефакт") */
  action?: string
  /** Дополнительный className на обёртку */
  className?: string
}

export function ReadonlyGate({ children, action, className }: ReadonlyGateProps) {
  const { isReadonly, triggerPaywall } = useReadonlyMode()

  if (!isReadonly) return <>{children}</>

  return (
    <div
      className={className}
      style={{ position: "relative", cursor: "not-allowed" }}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        triggerPaywall(action)
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          triggerPaywall(action)
        }
      }}
      role="button"
      aria-disabled="true"
      tabIndex={0}
    >
      {/* Прозрачный оверлей перехватывает все клики */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 10,
          cursor: "not-allowed",
        }}
        aria-hidden="true"
      />
      {/* Контент с визуальным dimming */}
      <div style={{ opacity: 0.5, pointerEvents: "none", userSelect: "none" }}>
        {children}
      </div>
    </div>
  )
}
