"use client"

/* ================================================================
   OSGARD · ДЖАРВИС — глобальная плавающая кнопка
   ----------------------------------------------------------------
   Монтируется в AppShell, доступна на всех страницах. Клик по FAB
   открывает панель чата (JarvisChat из JarvisChat.tsx). Для гостей —
   вместо чата показывается paywall (все /jarvis/* роуты бэкенда
   требуют авторизации).
   ================================================================ */

import { useState } from "react"
import { X } from "lucide-react"
import JarvisChat from "@/components/JarvisChat"
import { useAuth } from "@/lib/auth-store"
import { useReadonlyMode } from "@/lib/readonly-mode"
import { AvatarOrb } from "@/components/ui/AvatarOrb"

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
          <JarvisChat />
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
          background: "transparent",
          border: "none",
          cursor: "pointer",
        }}
      >
        {open && isAuthenticated ? (
          <span
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "#0A0A0F",
              color: "#00D4FF",
              boxShadow: "0 4px 20px rgba(0,212,255,0.45)",
            }}
          >
            <X size={24} strokeWidth={2} aria-hidden="true" />
          </span>
        ) : (
          <AvatarOrb size={56} variant="idle" />
        )}
      </button>
    </>
  )
}
