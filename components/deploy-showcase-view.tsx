"use client"

/* ================================================================
   DeployShowcaseView — публичная витрина задеплоенного проекта
   ----------------------------------------------------------------
   Output Trail: цель ссылки, вшитой в футер сгенерированного сайта
   ("⚡ Built with OSGARD in {N} мин"). Не требует авторизации —
   источник данных: GET /share/deployed/:id (backend/src/routes/share.routes.ts).
   ================================================================ */

import { useEffect, useState } from "react"
import Link from "next/link"
import { ExternalLink, Sparkles, Clock } from "lucide-react"
import { API_BASE_URL } from "@/lib/api-client"

const CARD = "#17242a"
const BORDER = "#30424b"
const LABEL = "#9eb2bc"
const ACCENT = "#d7ae57"

type DeployedProject = {
  id: number
  name: string
  description: string | null
  liveUrl: string
  createdAt: number
  owner: string
  durationMs: number | null
}

function formatDuration(ms: number | null): string | null {
  if (!ms || ms <= 0) return null
  const minutes = Math.max(1, Math.round(ms / 60_000))
  return `${minutes} мин.`
}

export function DeployShowcaseView({ id }: { id: number }) {
  const [project, setProject] = useState<DeployedProject | null | undefined>(undefined)

  useEffect(() => {
    fetch(`${API_BASE_URL}/share/deployed/${id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setProject(data))
      .catch(() => setProject(null))
  }, [id])

  if (project === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ backgroundColor: "#10181d", color: LABEL }}>
        Загрузка…
      </div>
    )
  }

  if (!project) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4" style={{ backgroundColor: "#10181d", color: LABEL }}>
        <p>Проект не найден или ещё не опубликован.</p>
        <Link href="/" className="text-[13px]" style={{ color: ACCENT }}>
          На главную OSGARD →
        </Link>
      </div>
    )
  }

  const duration = formatDuration(project.durationMs)

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#10181d" }}>
      <main className="mx-auto max-w-2xl px-6 py-16">
        <div className="mb-6 flex items-center gap-2" style={{ color: ACCENT }}>
          <Sparkles size={16} strokeWidth={1.75} aria-hidden="true" />
          <span className="text-[12px] uppercase tracking-[0.14em]">Создано на OSGARD</span>
        </div>

        <h1 className="text-2xl font-semibold" style={{ color: "#FFFFFF" }}>
          {project.name}
        </h1>
        {project.description && (
          <p className="mt-2 text-[14px]" style={{ color: LABEL }}>
            {project.description}
          </p>
        )}

        <div className="mt-6 rounded-2xl p-6" style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}>
          <p className="text-[13px]" style={{ color: LABEL }}>
            Автор: <span style={{ color: "#FFFFFF" }}>{project.owner}</span>
          </p>
          {duration && (
            <p className="mt-2 flex items-center gap-1.5 text-[13px]" style={{ color: LABEL }}>
              <Clock size={13} strokeWidth={1.75} aria-hidden="true" />
              Выковано за {duration}
            </p>
          )}

          <a
            href={project.liveUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-full py-2.5 text-[13px] font-medium transition-opacity hover:opacity-90"
            style={{ border: `1px solid ${ACCENT}`, color: ACCENT }}
          >
            <ExternalLink size={14} strokeWidth={1.75} aria-hidden="true" />
            Открыть сайт
          </a>
        </div>

        <p className="mt-8 text-center text-[13px]" style={{ color: LABEL }}>
          Хотите такой же?{" "}
          <Link href="/" className="font-medium" style={{ color: ACCENT }}>
            Создайте свой на OSGARD →
          </Link>
        </p>
      </main>
    </div>
  )
}
