import type { Metadata, Viewport } from "next"
import { headers } from "next/headers"
import "@fontsource-variable/inter"
import "@fontsource-variable/space-grotesk"
import "@fontsource-variable/cormorant-garamond"
import "@fontsource-variable/playfair-display"
import "./globals.css"
import { AuthProvider } from "@/lib/auth-store"
import { I18nProvider } from "@/lib/i18n/use-translation"
import { Footer } from "@/components/footer"
import { AppShell } from "@/components/AppShell"
import { RouteStoreProvider } from "@/components/RouteStoreProvider"

export const metadata: Metadata = {
  metadataBase: new URL("https://osgardnewworld.com"),
  title: {
    default: "OSGARD NEW WORLD — Build beyond imagination",
    template: "%s | OSGARD NEW WORLD",
  },
  description: "OSGARD NEW WORLD — AI-платформа, которая превращает идеи в рабочие проекты: бриф, код, preview и развитие продукта.",
  generator: "v0.app",
  alternates: {
    canonical: "https://osgardnewworld.com",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon-dark-32x32.png", type: "image/png", sizes: "32x32" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-icon.png",
  },
  openGraph: {
    title: "OSGARD NEW WORLD",
    description: "AI-платформа для создания и развития рабочих проектов",
    url: "https://osgardnewworld.com",
    siteName: "OSGARD NEW WORLD",
    locale: "ru_RU",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "OSGARD NEW WORLD",
    description: "AI-платформа для создания и развития рабочих проектов",
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

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Чтение nonce из headers() обязательно: это переводит рендер в динамический режим
  // (per-request), синхронизируя его с nonce, который proxy.ts генерирует на каждый
  // запрос заново. Next.js сам подставляет это значение в свои внутренние <script>
  // (chunks + инлайн-гидратация) — без этого чтения CSP nonce+strict-dynamic блокирует
  // вообще все скрипты (см. proxy.ts).
  await headers()

  return (
    <html lang="ru" className="bg-background">
      <body className="font-sans antialiased">
        <I18nProvider>
          <AuthProvider>
            <RouteStoreProvider>
              <AppShell>
                {children}
              </AppShell>
              <Footer />
            </RouteStoreProvider>
          </AuthProvider>
        </I18nProvider>

      </body>
    </html>
  )
}
