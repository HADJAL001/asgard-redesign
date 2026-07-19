import { Analytics } from "@vercel/analytics/next"
import type { Metadata, Viewport } from "next"
import { Inter, Space_Grotesk, Cormorant_Garamond, Playfair_Display } from "next/font/google"
import "./globals.css"
import { OsgardStoreProvider } from "@/components/osgard-store"

const inter = Inter({ subsets: ["latin", "cyrillic"], variable: "--font-inter" })
const space = Space_Grotesk({ subsets: ["latin"], variable: "--font-space" })
const cormorant = Cormorant_Garamond({
  subsets: ["latin", "cyrillic"],
  weight: ["500", "600", "700"],
  variable: "--font-cormorant",
})
const playfair = Playfair_Display({
  subsets: ["latin", "cyrillic"],
  weight: ["500", "600", "700"],
  variable: "--font-playfair",
})

export const metadata: Metadata = {
  title: "OSGARD Neural Platform — Build beyond imagination",
  description: "OSGARD Neural Platform: an AI-powered command interface for designing, building and launching digital products.",
  generator: "v0.app",
}

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#07070C",
  width: "device-width",
  initialScale: 1,
  userScalable: true,
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" className="bg-background">
      <body
        className={`${inter.variable} ${space.variable} ${cormorant.variable} ${playfair.variable} font-sans antialiased`}
      >
        <OsgardStoreProvider>{children}</OsgardStoreProvider>
        {process.env.NODE_ENV === "production" && <Analytics />}
      </body>
    </html>
  )
}
