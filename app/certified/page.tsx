import { Suspense } from "react"
import dynamic from "next/dynamic"
import { PageLoader } from "@/components/osgard-loader"

const CertifiedRegistryView = dynamic(
  () => import("@/components/certified-registry-view").then((m) => m.CertifiedRegistryView),
  { loading: () => <PageLoader /> },
)

export default function Page() {
  return (
    <Suspense fallback={<PageLoader />}>
      <CertifiedRegistryView />
    </Suspense>
  )
}
