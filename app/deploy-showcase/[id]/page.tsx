import type { Metadata } from "next"
import { DeployShowcaseView } from "@/components/deploy-showcase-view"

/* Публичные мета-теги для Output Trail ссылки из футера сгенерированного сайта. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const base = (process.env.BACKEND_URL || "").replace(/\/$/, "")
  try {
    if (base) {
      const res = await fetch(`${base}/share/deployed/${id}`, { next: { revalidate: 300 } })
      if (res.ok) {
        const p = (await res.json()) as { name: string; owner: string }
        const title = `${p.name} — создано на OSGARD`
        const description = `${p.owner} создал этот сайт на OSGARD. Создайте свой за минуты.`
        return {
          title,
          description,
          openGraph: {
            title,
            description,
            type: "website",
            url: `https://osgardnewworld.com/deploy-showcase/${id}`,
          },
          twitter: { card: "summary_large_image", title, description },
        }
      }
    }
  } catch {
    /* бэкенд недоступен — отдаём бренд-фолбэк ниже */
  }
  return {
    title: "Проект — OSGARD",
    description: "AI создаёт готовый сайт за минуты. Создайте свой на OSGARD.",
  }
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <DeployShowcaseView id={Number(id)} />
}
