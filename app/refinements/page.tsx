import { Suspense } from "react"
import dynamic from "next/dynamic"
import { PageLoader } from "@/components/osgard-loader"

const RefinementsView = dynamic(
  () => import("@/components/refinements-view").then((m) => m.RefinementsView),
  { loading: () => <PageLoader /> },
)

export default function Page() {
  return (
    <Suspense fallback={<PageLoader />}>
      <RefinementsView />
    </Suspense>
  )
}
