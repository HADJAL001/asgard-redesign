"use client"

import dynamic from "next/dynamic"
import { PageLoader } from "@/components/osgard-loader"

const ApiKeysView = dynamic(
  () => import("@/components/api-keys-view").then((m) => m.ApiKeysView),
  {
    loading: () => <PageLoader />,
    ssr: false,
  }
)

export default function DeveloperPage() {
  return <ApiKeysView />
}
