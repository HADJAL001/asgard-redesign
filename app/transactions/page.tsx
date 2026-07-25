"use client"

import dynamic from "next/dynamic"
import { PageLoader } from "@/components/osgard-loader"

const TransactionsView = dynamic(
  () => import("@/components/transactions-view").then((m) => m.TransactionsView),
  {
    loading: () => <PageLoader />,
    ssr: false,
  }
)

export default function TransactionsPage() {
  return <TransactionsView />
}
