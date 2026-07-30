"use client"

/* ================================================================
   OSGARD · /dev — режим разработчика («Космическая студия»).
   ----------------------------------------------------------------
   Роут именно /dev, а не /developer или /studio: обе ниши уже заняты
   (/developer — API-ключи, /studio — гостевая песочница лендинга).

   ssr:false + PageLoader — принятый в проекте паттерн страниц-роутов
   (см. app/projects/page.tsx, app/forge/page.tsx).
   ================================================================ */

import dynamic from "next/dynamic"
import { PageLoader } from "@/components/osgard-loader"

const DevShell = dynamic(() => import("@/components/dev-mode/DevShell").then((m) => m.DevShell), {
  loading: () => <PageLoader />,
  ssr: false,
})

const DevStudioView = dynamic(
  () => import("@/components/dev-mode/DevStudioView").then((m) => m.DevStudioView),
  {
    loading: () => <PageLoader />,
    ssr: false,
  },
)

export default function DevPage() {
  return (
    <DevShell>
      <DevStudioView />
    </DevShell>
  )
}
