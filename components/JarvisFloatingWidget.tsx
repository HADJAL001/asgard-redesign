"use client"

/* ================================================================
   OSGARD · ДЖАРВИС — глобальная плавающая кнопка
   ----------------------------------------------------------------
   Монтируется в AppShell, доступна на всех страницах. Клик по FAB
   открывает панель чата (ВАЛЛИChat из JarvisChat.tsx). Для гостей —
   вместо чата показывается paywall (все /jarvis/* роуты бэкенда
   требуют авторизации).
   ================================================================ */

import { useState } from "react"
import { Bot, X } from "lucide-react"
import ВАЛЛИChat from "@/components/JarvisChat"
import { useAuth } from "@/lib/auth-store"
import { useReadonlyMode } from "@/lib/readonly-mode"

export function JarvisFloatingWidget() {
  const [open, setOpen] = useState(false)
  const { isAuthenticated } = useAuth()
  const { triggerPaywall } = useReadonlyMode()

  function handleToggle() {
    if (!isAuthenticated) {
      triggerPaywall("ДЖАРВИС")
      return
    }
    setOpen((v) => !v)
  }

  return (
    <>
      {open && isAuthenticated && (
        <div
          style={{
            position: "fixed",
            right: 24,
            bottom: 96,
            zIndex: 9998,
            boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
            borderRadius: 18,
            overflow: "hidden",
          }}
        >
          <ВАЛЛИChat />
        </div>
      )}

      <button
        type="button"
        onClick={handleToggle}
        aria-label={open ? "Закрыть ДЖАРВИС" : "Открыть ДЖАРВИС"}
        style={{
          position: "fixed",
          right: 24,
          bottom: 24,
          zIndex: 9999,
          width: 56,
          height: 56,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#00D4FF",
          color: "#0A0A0F",
          border: "none",
          boxShadow: "0 4px 20px rgba(0,212,255,0.45)",
          cursor: "pointer",
        }}
      >
        {open && isAuthenticated ? (
          <X size={24} strokeWidth={2} aria-hidden="true" />
        ) : (
          <Bot size={26} strokeWidth={1.75} aria-hidden="true" />
        )}
      </button>
    </>
  )
}
