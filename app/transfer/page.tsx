"use client"

import dynamic from "next/dynamic"
import { PageLoader } from "@/components/osgard-loader"

const TransferView = dynamic(
  () => import("@/components/transfer-view").then((m) => m.TransferView),
  {
    loading: () => <PageLoader />,
    ssr: false,
  }
)

export default function Page() {
  return <TransferView />
}
