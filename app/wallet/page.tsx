"use client"

import dynamic from "next/dynamic"
import { PageLoader } from "@/components/osgard-loader"

const WalletView = dynamic(
  () => import("@/components/wallet-view").then((m) => m.WalletView),
  {
    loading: () => <PageLoader />,
    ssr: false,
  }
)

export default function Page() {
  return <WalletView />
}
