"use client"

/* ================================================================
   OSGARD · /dev/workspace — выбор проекта для раздела «Код».
   ----------------------------------------------------------------
   Рельс студии ведёт сюда; конкретное приложение открывается на
   /dev/workspace/:id. Единственный проект открывается сразу — см.
   components/dev-mode/DevWorkspacePicker.tsx.
   ================================================================ */

import dynamic from "next/dynamic"
import { PageLoader } from "@/components/osgard-loader"

const DevShell = dynamic(() => import("@/components/dev-mode/DevShell").then((m) => m.DevShell), {
  loading: () => <PageLoader />,
  ssr: false,
})

const DevWorkspacePicker = dynamic(
  () => import("@/components/dev-mode/DevWorkspacePicker").then((m) => m.DevWorkspacePicker),
  {
    loading: () => <PageLoader />,
    ssr: false,
  },
)

export default function DevWorkspacePickerPage() {
  return (
    <DevShell>
      <DevWorkspacePicker />
    </DevShell>
  )
}
