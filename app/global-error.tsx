"use client"

import { useEffect } from "react"
import { captureError } from "@/lib/sentry-client"

/* Перехватывает ошибки, которые ломают сам root layout.tsx — единственное
   место, где нужно рендерить собственные <html>/<body>, т.к. на этом уровне
   layout.tsx уже недоступен. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    captureError("[app/global-error]", error)
  }, [error])

  return (
    <html lang="ru">
      <body
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          padding: 24,
          textAlign: "center",
          background: "radial-gradient(ellipse at 50% 18%, rgba(212,175,55,.12), transparent 42%), #05060b",
          color: "#e5e4e2",
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        <h2 style={{ fontSize: 20, fontWeight: 600 }}>Критическая ошибка</h2>
        <span style={{ color: "#d4af37", fontFamily: "monospace", fontSize: 11, letterSpacing: ".13em" }}>OSGARD / SYSTEM RECOVERY</span>
        <p style={{ opacity: 0.7, maxWidth: 480 }}>
          Приложение не смогло загрузиться. Мы уже знаем об этой ошибке.
        </p>
        <button
          type="button"
          onClick={() => reset()}
          style={{
            padding: "10px 20px",
            borderRadius: 12,
            border: "1px solid #f9e2a6",
            background: "linear-gradient(135deg, #f9e2a6, #d4af37, #8b6508)",
            color: "#17120a",
            boxShadow: "0 6px 20px rgba(212,175,55,.28)",
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          Попробовать снова
        </button>
      </body>
    </html>
  )
}
