import { Suspense } from "react"
import { ArtifactsView } from "@/components/artifacts-view"

export default function ArtifactsPage() {
  return (
    <Suspense fallback={null}>
      <ArtifactsView />
    </Suspense>
  )
}
