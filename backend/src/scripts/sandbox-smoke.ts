import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { buildNextStaticExport, isDockerAvailable } from "../services/sandbox.service"

/* Смоук-тест песочницы: собирает минимальный, но настоящий Next.js static-export
   проект (тот же шаблон, что генерирует app-generator.ts) в Docker-контейнере и
   проверяет, что out/index.html реально появился на хосте. Запуск:
     npx tsx src/scripts/sandbox-smoke.ts */

const files = [
  {
    path: "package.json",
    content: JSON.stringify(
      {
        name: "sandbox-smoke",
        version: "0.1.0",
        private: true,
        scripts: { build: "next build" },
        dependencies: { next: "^14.2.0", react: "^18.3.0", "react-dom": "^18.3.0" },
        devDependencies: {
          typescript: "^5.7.0",
          tailwindcss: "^3.4.0",
          postcss: "^8.4.0",
          autoprefixer: "^10.4.0",
          "@types/node": "^22.0.0",
          "@types/react": "^18.3.0",
          "@types/react-dom": "^18.3.0",
        },
      },
      null,
      2,
    ),
  },
  {
    path: "next.config.js",
    content: `/** @type {import('next').NextConfig} */\nconst nextConfig = { output: "export", images: { unoptimized: true }, typescript: { ignoreBuildErrors: true }, eslint: { ignoreDuringBuilds: true } }\nmodule.exports = nextConfig\n`,
  },
  {
    path: "tsconfig.json",
    content: JSON.stringify(
      {
        compilerOptions: {
          target: "es2017",
          lib: ["dom", "dom.iterable", "esnext"],
          allowJs: true,
          skipLibCheck: true,
          strict: true,
          noEmit: true,
          esModuleInterop: true,
          module: "esnext",
          moduleResolution: "bundler",
          resolveJsonModule: true,
          isolatedModules: true,
          jsx: "preserve",
          incremental: true,
          paths: { "@/*": ["./*"] },
        },
        include: ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
        exclude: ["node_modules"],
      },
      null,
      2,
    ),
  },
  {
    path: "tailwind.config.ts",
    content: `import type { Config } from "tailwindcss"\nconst config: Config = { content: ["./app/**/*.{ts,tsx}"], theme: { extend: {} }, plugins: [] }\nexport default config\n`,
  },
  { path: "postcss.config.js", content: `module.exports = { plugins: { tailwindcss: {}, autoprefixer: {} } }\n` },
  { path: "app/globals.css", content: `@tailwind base;\n@tailwind components;\n@tailwind utilities;\n` },
  {
    path: "app/layout.tsx",
    content: `import "./globals.css"\nexport const metadata = { title: "Smoke" }\nexport default function RootLayout({ children }: { children: React.ReactNode }) {\n  return (<html lang="ru"><body>{children}</body></html>)\n}\n`,
  },
  {
    path: "app/page.tsx",
    content: `export default function Page() {\n  return (<main className="p-8 text-2xl font-bold">Sandbox build works</main>)\n}\n`,
  },
]

async function main() {
  console.log("Docker доступен:", await isDockerAvailable())
  const outParent = await fs.mkdtemp(path.join(os.tmpdir(), "sandbox-smoke-out-"))
  console.log("Собираю в песочнице... (npm install + next build)")
  const t0 = Date.now()
  const result = await buildNextStaticExport(files, outParent, { logLabel: "smoke", timeoutMs: 8 * 60 * 1000 })
  console.log(`\n=== РЕЗУЛЬТАТ (${Math.round((Date.now() - t0) / 1000)}с) ===`)
  console.log("ok:", result.ok, "| timedOut:", result.timedOut, "| outDir:", result.outDir)
  if (result.outDir) {
    const entries = await fs.readdir(result.outDir).catch((): string[] => [])
    console.log("Содержимое out/:", entries.slice(0, 20).join(", "))
    const hasIndex = entries.includes("index.html")
    console.log("index.html присутствует:", hasIndex)
    console.log(hasIndex ? "\n✅ ПЕСОЧНИЦА РАБОТАЕТ — реальная сборка прошла в контейнере" : "\n⚠️ out/ есть, но нет index.html")
  } else {
    console.log("\n--- ЛОГИ (хвост) ---")
    console.log(result.logs.slice(-3000))
    console.log("\n❌ Сборка не удалась")
  }
  await fs.rm(outParent, { recursive: true, force: true }).catch(() => {})
  process.exit(result.ok ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
