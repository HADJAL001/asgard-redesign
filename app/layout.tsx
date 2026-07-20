import { Analytics } from "@vercel/analytics/next"
import type { Metadata, Viewport } from "next"
import { Inter, Space_Grotesk, Cormorant_Garamond, Playfair_Display } from "next/font/google"
import "./globals.css"
import { OsgardStoreProvider } from "@/components/osgard-store"
import { AuthProvider } from "@/lib/auth-store"
import { I18nProvider } from "@/lib/i18n/use-translation"
import { Footer } from "@/components/footer"


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
  title: "OSGARD NEW WORLD — Build beyond imagination",
  description: "OSGARD NEW WORLD: премиальная AI-платформа нового мира — создавай, торгуй, развивайся в цифровой вселенной.",
  generator: "v0.app",
}

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#0A1128",
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
        <I18nProvider>
          <AuthProvider>
            <OsgardStoreProvider>
              {children}
              <Footer />
            </OsgardStoreProvider>
          </AuthProvider>
        </I18nProvider>

        {process.env.NODE_ENV === "production" && <Analytics />}
      </body>
    </html>
  )
}
