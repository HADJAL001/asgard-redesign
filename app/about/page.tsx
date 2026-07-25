import dynamic from "next/dynamic"
import { PageLoader } from "@/components/osgard-loader"

const AboutView = dynamic(() => import("@/components/about-view").then((m) => m.AboutView), {
  loading: () => <PageLoader />,
})

export default function AboutPage() {
  return <AboutView />
}
