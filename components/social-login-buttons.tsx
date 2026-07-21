"use client"

/* ================================================================
   OSGARD · Кнопки соц-входа
   ----------------------------------------------------------------
   Обычные <a href> на бэкенд (не через /api-прокси — там нет
   поддержки 302-редиректов OAuth). Бэкенд сам ведёт пользователя
   к провайдеру и обратно на /auth/callback.
   ================================================================ */

import type { ReactElement } from "react"

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3002"

const PROVIDERS: { id: string; label: string; icon: ReactElement }[] = [
  {
    id: "google",
    label: "Google",
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4">
        <path fill="#4285F4" d="M23.5 12.3c0-.85-.08-1.66-.22-2.44H12v4.62h6.46c-.28 1.5-1.13 2.77-2.4 3.62v3h3.87c2.27-2.09 3.57-5.17 3.57-8.8z" />
        <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.9l-3.87-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.11C3.24 21.3 7.28 24 12 24z" />
        <path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.6H1.27A11.96 11.96 0 0 0 0 12c0 1.93.46 3.76 1.27 5.4l4-3.11z" />
        <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.28 0 3.24 2.7 1.27 6.6l4 3.11C6.22 6.86 8.87 4.75 12 4.75z" />
      </svg>
    ),
  },
  {
    id: "github",
    label: "GitHub",
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
        <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.57.1.78-.25.78-.55v-2.02c-3.2.7-3.88-1.54-3.88-1.54-.52-1.34-1.28-1.69-1.28-1.69-1.04-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.64 1.6.24 2.76.12 3.05.74.81 1.18 1.84 1.18 3.1 0 4.43-2.7 5.4-5.26 5.69.41.36.78 1.06.78 2.14v3.17c0 .3.2.66.79.55A10.52 10.52 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
      </svg>
    ),
  },
]

export function SocialLoginButtons() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-[#2A2A3E]" />
        <span className="text-xs text-[#6A6A8A]">или через</span>
        <div className="h-px flex-1 bg-[#2A2A3E]" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {PROVIDERS.map((p) => (
          <a
            key={p.id}
            href={`${BACKEND_URL}/auth/${p.id}`}
            title={p.label}
            className="flex items-center justify-center rounded-lg border border-[#2A2A3E] bg-[#0A0A0F] py-2.5 text-white transition-colors hover:border-[#00D4FF]/50 hover:bg-[#14141E]"
          >
            {p.icon}
          </a>
        ))}
      </div>
    </div>
  )
}
