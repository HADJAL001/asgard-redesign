import type { Metadata } from "next"
import { ArtifactDetailView } from "@/components/artifact-detail-view"

/* Публичные мета-теги для shareable-ссылки на артефакт. og:image/twitter:image
   Next подставляет автоматически из opengraph-image.tsx в этом же сегменте.
   Здесь задаём title/description, чтобы карточка в соцсетях была «вкусной». */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const base = (process.env.BACKEND_URL || "").replace(/\/$/, "")
  try {
    if (base) {
      const res = await fetch(`${base}/share/artifacts/${id}`, { next: { revalidate: 300 } })
      if (res.ok) {
        const a = (await res.json()) as {
          name: string
          type: string
          rarity: string
          power: number
          defense: number
          magic: number
          speed: number
          owner: string
        }
        const title = `${a.name} — ${a.rarity} ${a.type} · OSGARD`
        const description = `Сила ${a.power} · Защита ${a.defense} · Магия ${a.magic} · Скорость ${a.speed}. Выковал ${a.owner}. Создай свой артефакт на OSGARD.`
        return {
          title,
          description,
          openGraph: {
            title,
            description,
            type: "website",
            url: `https://osgardnewworld.com/artifact/${id}`,
          },
          twitter: { card: "summary_large_image", title, description },
        }
      }
    }
  } catch {
    /* бэкенд недоступен — отдаём бренд-фолбэк ниже */
  }
  return {
    title: "Артефакт — OSGARD",
    description: "AI создаёт проект, а артефакты рождаются вместе с ним. Выкуй свой на OSGARD.",
  }
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <ArtifactDetailView id={Number(id)} />
}
