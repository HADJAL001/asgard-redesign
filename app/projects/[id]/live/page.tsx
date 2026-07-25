import dynamic from "next/dynamic"
import { PageLoader } from "@/components/osgard-loader"

/* Отдельная страница живого запуска. Именно ей (роут /projects/:id/live) в
   next.config.mjs выданы заголовки COOP/COEP для кросс-origin изоляции —
   она нужна WebContainer'у (SharedArrayBuffer). Держим запуск на отдельном
   роуте, а не во вкладке /projects/:id, чтобы COEP не ломал Monaco-редактор
   (грузит воркеры с CDN) на странице деталей проекта. */

const ProjectLivePage = dynamic(
  () => import("@/components/project-live-page").then((m) => m.ProjectLivePage),
  {
    loading: () => <PageLoader />,
  },
)

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <ProjectLivePage projectId={Number(id)} />
}
