import dynamic from "next/dynamic"
import { PageLoader } from "@/components/osgard-loader"

const SecretRoomView = dynamic(() => import("@/components/secret-room-view").then((m) => m.SecretRoomView), {
  loading: () => <PageLoader />,
})

export default function RoomPage() {
  return <SecretRoomView />
}
