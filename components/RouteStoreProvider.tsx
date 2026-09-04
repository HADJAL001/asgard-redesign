"use client"

import dynamic from "next/dynamic"
import { usePathname } from "next/navigation"
import { useAuth } from "@/lib/auth-store"

const OsgardStoreProvider = dynamic(
  () => import("@/lib/store/osgard-store").then((m) => m.OsgardStoreProvider),
  { ssr: false },
)

export function RouteStoreProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { isAuthenticated } = useAuth()

  // A guest on the public landing page only needs project generation. Loading
  // the wallet, market and artifact state here delays the first meaningful view.
  if (pathname === "/" && !isAuthenticated) return <>{children}</>

  return <OsgardStoreProvider>{children}</OsgardStoreProvider>
}
