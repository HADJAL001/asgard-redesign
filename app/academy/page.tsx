import { Suspense } from "react"
import dynamic from "next/dynamic"
import { PageLoader } from "@/components/osgard-loader"

const AcademyView = dynamic(() => import("@/components/academy-view").then((m) => m.AcademyView), {
  loading: () => <PageLoader />,
})

export default function Page() {
  return (
    <Suspense fallback={<PageLoader />}>
      <AcademyView />
    </Suspense>
  )
}
