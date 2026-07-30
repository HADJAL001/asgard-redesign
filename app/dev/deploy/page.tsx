"use client"

/* ================================================================
   OSGARD · /dev/deploy — раздел «Деплой и адреса» студии.
   ----------------------------------------------------------------
   ssr:false + PageLoader — принятый в проекте паттерн страниц-роутов
   (см. app/dev/page.tsx, app/projects/page.tsx).
   ================================================================ */

import dynamic from "next/dynamic"
import { PageLoader } from "@/components/osgard-loader"

const DevShell = dynamic(() => import("@/components/dev-mode/DevShell").then((m) => m.DevShell), {
  loading: () => <PageLoader />,
  ssr: false,
})

const DevDeployView = dynamic(
  () => import("@/components/dev-mode/DevDeployView").then((m) => m.DevDeployView),
  {
    loading: () => <PageLoader />,
    ssr: false,
  },
)

export default function DevDeployPage() {
  return (
    <DevShell>
      <DevDeployView />
    </DevShell>
  )
}
