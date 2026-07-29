"use client"

/* ================================================================
   OSGARD · /dev/memory — «Память платформы».
   ----------------------------------------------------------------
   ssr:false + PageLoader — принятый в проекте паттерн страниц-роутов
   (см. app/dev/page.tsx, app/dev/agents/page.tsx).
   ================================================================ */

import dynamic from "next/dynamic"
import { PageLoader } from "@/components/osgard-loader"

const DevShell = dynamic(() => import("@/components/dev-mode/DevShell").then((m) => m.DevShell), {
  loading: () => <PageLoader />,
  ssr: false,
})

const DevMemoryView = dynamic(
  () => import("@/components/dev-mode/DevMemoryView").then((m) => m.DevMemoryView),
  {
    loading: () => <PageLoader />,
    ssr: false,
  },
)

export default function DevMemoryPage() {
  return (
    <DevShell>
      <DevMemoryView />
    </DevShell>
  )
}
