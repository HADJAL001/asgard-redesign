/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "**.railway.app" },
      { protocol: "https", hostname: "**.vercel.app" },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            // 'unsafe-inline' и 'unsafe-eval' нужны для Next.js (HMR, inline styles, Three.js)
            // connect-src включает оба домена бэкенда (Railway + продакшн)
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://vercel.live https://*.vercel-scripts.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com data:",
              "img-src 'self' data: blob: https:",
              "connect-src 'self' https://osgardnewworld.com https://*.railway.app https://*.vercel.app wss://*.railway.app https://api.mainnet-beta.solana.com https://vitals.vercel-insights.com https://vercel.live",
              "worker-src 'self' blob:",
              "frame-src 'self' https://vercel.live",
              "media-src 'self' blob:",
            ].join("; "),
          },
        ],
      },
    ]
  },
}

export default nextConfig
