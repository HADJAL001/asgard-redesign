"use client"

/* ================================================================
   OSGARD · /dev/agents — раздел «Агенты» студии разработчика.
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

const DevAgentsView = dynamic(
  () => import("@/components/dev-mode/DevAgentsView").then((m) => m.DevAgentsView),
  {
    loading: () => <PageLoader />,
    ssr: false,
  },
)

export default function DevAgentsPage() {
  return (
    <DevShell>
      <DevAgentsView />
    </DevShell>
  )
}
