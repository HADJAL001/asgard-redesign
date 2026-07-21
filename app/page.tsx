"use client"

import dynamic from "next/dynamic"

const EternityLanding = dynamic(
  () => import("@/components/eternity-landing").then((m) => m.EternityLanding),
  {
    loading: () => (
      <div className="flex items-center justify-center py-32" style={{ color: "#6A6A8A" }}>
        Загрузка…
      </div>
    ),
    ssr: false,
  }
)

const DemoProjectGenerator = dynamic(
  () => import("@/components/DemoProjectGenerator").then((m) => m.DemoProjectGenerator),
  { loading: () => null, ssr: false }
)

export default function Page() {
  return (
    <>
      <EternityLanding />
      <DemoProjectGenerator />
    </>
  )
}
