import { Suspense } from "react"
import { ForgeView } from "@/components/forge-view"

export default function ForgePage() {
  return (
    <Suspense fallback={null}>
      <ForgeView />
    </Suspense>
  )
}
