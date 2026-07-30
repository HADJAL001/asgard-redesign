import dynamic from "next/dynamic"
import { PageLoader } from "@/components/osgard-loader"

/* Мастерская проекта, открытая из режима разработчика.
   Компонент ТОТ ЖЕ, что и на /projects/:id/workspace — второй копии нет:
   SSE-поток генерации, Monaco, WebContainer и деплой обязаны развиваться
   в одном месте, иначе два мира разъедутся на первой же правке. Отличия
   режима (шапка вместо Navbar, отсутствие экономических элементов) живут
   внутри самого view под флагом mode === "dev" (см. lib/dev-mode.tsx).

   Кросс-origin изоляция (COOP + COEP=credentialless) выдана и этому роуту
   в next.config.mjs — без неё WebContainer не получит SharedArrayBuffer и
   живое превью молча не запустится.

   `ssr: false` здесь НЕ ставим — в серверном компоненте App Router он не
   поддерживается (образец: app/projects/[id]/workspace/page.tsx). */
const ProjectWorkspaceView = dynamic(
  () => import("@/components/project-workspace-view").then((m) => m.ProjectWorkspaceView),
  { loading: () => <PageLoader /> },
)

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <ProjectWorkspaceView projectId={Number(id)} />
}
