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
          background: "#0A0A0F",
          color: "#fff",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <h2 style={{ fontSize: 20, fontWeight: 600 }}>Критическая ошибка</h2>
        <p style={{ opacity: 0.7, maxWidth: 480 }}>
          Приложение не смогло загрузиться. Мы уже знаем об этой ошибке.
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
      </body>
    </html>
  )
}
