import { Suspense } from "react"
import dynamic from "next/dynamic"
import { PageLoader } from "@/components/osgard-loader"

const VaultView = dynamic(() => import("@/components/vault-view").then((m) => m.VaultView), {
  loading: () => <PageLoader />,
})

export default function Page() {
  return (
    <Suspense fallback={<PageLoader />}>
      <VaultView />
    </Suspense>
  )
}
