import dynamic from "next/dynamic"
import { PageLoader } from "@/components/osgard-loader"

/* «Мастерская» проекта — единственный экран, где приложение видно целиком:
   файлы + Monaco + живой запуск (WebContainer) + чат с Клодом + конвейер сборки.

   Заголовки кросс-origin изоляции (COOP + COEP=credentialless) выданы этому
   роуту в next.config.mjs — они нужны WebContainer'у для SharedArrayBuffer.
   Именно `credentialless` (а не `require-corp`) позволяет держать Monaco с CDN
   на ЭТОМ ЖЕ экране: тот же приём уже работает на /studio, где Monaco и
   WebContainer соседствуют — поэтому код и запуск больше не разнесены по
   разным страницам.

   `ssr: false` здесь НЕ ставим (в серверном компоненте App Router он не
   поддерживается): образец — соседний /projects/:id/live. Сам view помечен
   "use client", Monaco при SSR отдаёт свой лоадер, а WebContainer грузится
   динамическим import() уже в браузере. */
const ProjectWorkspaceView = dynamic(
  () => import("@/components/project-workspace-view").then((m) => m.ProjectWorkspaceView),
  { loading: () => <PageLoader /> },
)

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <ProjectWorkspaceView projectId={Number(id)} />
}
