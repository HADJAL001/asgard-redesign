"use client"

/* ================================================================
   OSGARD · /studio — гостевая студия сборки кода (Part 2)
   ----------------------------------------------------------------
   Отдельный роут вместо CTA внутри eternity-landing.tsx — так студия
   доступна по прямому URL и НЕ зависит от заблокированного лендинга
   (тот в работе у сессии A, Фаза 3). Когда Фаза 3 закроется, на
   лендинг добавится кнопка-ссылка на этот же /studio.

   ssr:false — GuestCodeStudio тянет Monaco и WebContainer (клиентские).
   COOP/COEP-заголовки для этого роута выставляет next.config.mjs
   (headers() с source:"/studio") — без них WebContainer-превью не
   поднимется (нужен SharedArrayBuffer).
   ================================================================ */

import dynamic from "next/dynamic"
import { guestCodeAdapter } from "@/lib/guest-code-adapter"

const GuestCodeStudio = dynamic(
  () => import("@/components/landing/GuestCodeStudio").then((m) => m.GuestCodeStudio),
  {
    ssr: false,
    loading: () => (
      <div style={{ display: "flex", justifyContent: "center", padding: "128px 0", color: "#6A6A8A" }}>
        Загрузка студии…
      </div>
    ),
  },
)

export default function StudioPage() {
  return <GuestCodeStudio adapter={guestCodeAdapter} />
}
