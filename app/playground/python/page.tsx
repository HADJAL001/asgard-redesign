import dynamic from "next/dynamic"
import { PageLoader } from "@/components/osgard-loader"

const PythonPlayground = dynamic(
  () => import("@/components/python-playground").then((m) => m.PythonPlayground),
  {
    loading: () => <PageLoader />,
  },
)

export default function Page() {
  return <PythonPlayground />
}
