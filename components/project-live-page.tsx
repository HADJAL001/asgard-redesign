"use client"

/* ================================================================
   ProjectLivePage — полноэкранная обёртка живого запуска проекта
   ----------------------------------------------------------------
   Рендерит ProjectLiveRun на отдельном изолированном роуте
   /projects/:id/live (COOP/COEP заданы для него в next.config.mjs).
   Здесь нет Monaco и внешних CDN-ресурсов, поэтому COEP require-corp
   ничего не ломает.
   ================================================================ */

import { useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { Navbar } from "./navbar"
import { ProjectLiveRun } from "./project-live-run"
import { COLORS } from "@/lib/economy"
import { useTranslation } from "@/lib/i18n/use-translation"

type Props = {
  projectId: number
}

export function ProjectLivePage({ projectId }: Props) {
  const { t } = useTranslation()
  const router = useRouter()

  return (
    <div className="min-h-screen font-sans" style={{ background: "linear-gradient(180deg, #0A0A0F 0%, #14141E 100%)", color: COLORS.text }}>
      <Navbar />
      <main className="mx-auto max-w-[1240px] px-6 py-10 md:px-10 md:py-12">
        <button
          type="button"
          onClick={() => router.push(`/projects/${projectId}`)}
          className="inline-flex items-center gap-2 text-[13px] transition-colors"
          style={{ color: COLORS.label }}
          onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.text)}
          onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.label)}
        >
          <ArrowLeft size={14} strokeWidth={1.75} />
          {t("projectDetail.backToProject")}
        </button>

        <h1 className="mt-4 text-[24px] font-semibold">{t("projectDetail.liveRunTab")}</h1>
        <p className="mt-1 text-[14px]" style={{ color: COLORS.label }}>{t("projectDetail.liveRunHint")}</p>

        <div className="mt-8">
          <ProjectLiveRun projectId={projectId} />
        </div>
      </main>
    </div>
  )
}
