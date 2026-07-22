import type { Metadata, Viewport } from "next"
import { Inter, Space_Grotesk, Cormorant_Garamond, Playfair_Display } from "next/font/google"
import "./globals.css"
import { OsgardStoreProvider } from "@/lib/store/osgard-store"
import { AuthProvider } from "@/lib/auth-store"
import { I18nProvider } from "@/lib/i18n/use-translation"
import { Footer } from "@/components/footer"
import { AppShell } from "@/components/AppShell"


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
  metadataBase: new URL("https://osgardnewworld.com"),
  title: {
    default: "OSGARD NEW WORLD — Build beyond imagination",
    template: "%s | OSGARD NEW WORLD",
  },
  description: "OSGARD NEW WORLD: премиальная AI-платформа нового мира — создавай, торгуй, развивайся в цифровой вселенной.",
  generator: "v0.app",
  alternates: {
    canonical: "https://osgardnewworld.com",
  },
  openGraph: {
    title: "OSGARD NEW WORLD",
    description: "Премиальная AI-платформа нового мира",
    url: "https://osgardnewworld.com",
    siteName: "OSGARD NEW WORLD",
    locale: "ru_RU",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "OSGARD NEW WORLD",
    description: "Премиальная AI-платформа нового мира",
    site: "@osgardnewworld",
  },
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
              <AppShell>
                {children}
                <Footer />
              </AppShell>
            </OsgardStoreProvider>
          </AuthProvider>
        </I18nProvider>

      </body>
    </html>
  )
}
