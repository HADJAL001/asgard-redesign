"use client"

import { useEffect } from "react"
import { ArrowLeft, ShieldAlert } from "lucide-react"
import { captureError } from "@/lib/sentry-client"

/* Перехватывает ошибки рендера внутри layout.tsx (не задевает сам root layout —
   для этого есть global-error.tsx). */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    captureError("[app/error]", error)
  }, [error])

  return (
    <main
      className="ds-body"
      style={{
        minHeight: "60vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        padding: 24,
        textAlign: "center",
      }}
    >
      <h2 style={{ fontSize: 20, fontWeight: 600 }}>Что-то пошло не так</h2>
      <ShieldAlert aria-hidden="true" size={30} style={{ color: "var(--ds-secondary)" }} />
      <p style={{ opacity: 0.7, maxWidth: 480 }}>
        Мы уже знаем об этой ошибке. Попробуйте обновить страницу или вернуться позже.
      </p>
      <button
        type="button"
        onClick={() => reset()}
        style={{
          padding: "10px 20px",
          borderRadius: 10,
          border: "1px solid rgba(255,255,255,0.2)",
          background: "transparent",
          color: "inherit",
          cursor: "pointer",
        }}
      >
        Попробовать снова
      </button>
      <a className="ds-dialog-secondary ds-focus" href="/cofounder"><ArrowLeft size={16} aria-hidden="true" /> Open command deck</a>
    </main>
  )
}
