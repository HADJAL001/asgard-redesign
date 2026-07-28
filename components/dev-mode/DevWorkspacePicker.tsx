"use client"

/* ================================================================
   OSGARD · DevWorkspacePicker — выбор проекта для раздела «Код».
   ----------------------------------------------------------------
   Раздел рельса ведёт сюда, а не в конкретную Мастерскую: проектов
   может быть много, и угадывать «нужный» за человека — врать. Если
   проект ровно один, открываем его сразу: выбор из одного варианта
   это не выбор, а лишний клик.

   Сама Мастерская (код, превью, деплой) живёт в общем для обоих миров
   ProjectWorkspaceView — см. app/dev/workspace/[id]/page.tsx.
   ================================================================ */

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Code2, Sparkles, CircleCheck, CircleAlert, CircleDashed } from "lucide-react"
import { useOsgardStore, type OsgardProject } from "@/lib/store/osgard-store"

function statusOf(project: OsgardProject): { label: string; color: string; Icon: typeof CircleCheck } {
  if (project.status === "generating") return { label: "Собирается", color: "#7DD3FC", Icon: CircleDashed }
  if (project.status === "failed") return { label: "Нужен ремонт", color: "#FBBF24", Icon: CircleAlert }
  return { label: "Готов", color: "#86EFAC", Icon: CircleCheck }
}

export function DevWorkspacePicker() {
  const router = useRouter()
  const { projects, fetchProjects, loading } = useOsgardStore()

  // Автопереход выполняем ровно один раз: иначе человек, вернувшийся
  // сюда кнопкой «назад», был бы силой заброшен обратно в проект.
  const redirected = useRef(false)

  useEffect(() => {
    fetchProjects({ skipAuthRedirect: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (redirected.current || loading || projects.length !== 1) return
    redirected.current = true
    router.replace(`/dev/workspace/${projects[0].id}`)
  }, [projects, loading, router])

  return (
    <>
      <section className="pt-2">
        <h1 className="dev-title text-[26px] leading-tight md:text-[32px]">Код</h1>
        <p className="mt-2 text-[14px]" style={{ color: "rgb(148 163 184 / 90%)" }}>
          Выберите приложение — откроются его файлы, редактор и живое превью.
        </p>
      </section>

      {loading && projects.length === 0 ? (
        <div className="mt-8 flex items-center gap-2.5" role="status">
          <Loader2 size={18} className="animate-spin" style={{ color: "#94A3B8" }} aria-hidden="true" />
          <span className="text-[14px]" style={{ color: "rgb(148 163 184 / 90%)" }}>
            Загружаем проекты…
          </span>
        </div>
      ) : null}

      {!loading && projects.length === 0 ? (
        <div
          className="mt-7 flex flex-col items-center gap-3 rounded-2xl px-6 py-14 text-center"
          style={{ border: "1px dashed rgb(226 232 240 / 18%)" }}
        >
          <Code2 size={34} strokeWidth={1.25} style={{ color: "#64748B" }} aria-hidden="true" />
          <p className="text-[14px]" style={{ color: "rgb(148 163 184 / 90%)" }}>
            Кода пока нет — сначала опишите идею, и агенты его напишут.
          </p>
          <button type="button" onClick={() => router.push("/dev")} className="dev-btn dev-btn--gold mt-1">
            <Sparkles size={16} strokeWidth={1.75} aria-hidden="true" />
            В Студию
          </button>
        </div>
      ) : null}

      {projects.length > 0 ? (
        <ul className="mt-7 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => {
            const status = statusOf(project)
            return (
              <li key={project.id}>
                <button
                  type="button"
                  onClick={() => router.push(`/dev/workspace/${project.id}`)}
                  className="dev-card w-full cursor-pointer p-4 text-left"
                  aria-label={`Открыть код проекта ${project.name}. Статус: ${status.label}`}
                >
                  <p className="text-[15px] font-medium" style={{ color: "#F1F5F9" }}>
                    {project.name}
                  </p>
                  {project.description ? (
                    <p className="mt-1.5 line-clamp-2 text-[13px]" style={{ color: "rgb(148 163 184 / 85%)" }}>
                      {project.description}
                    </p>
                  ) : null}
                  <span className="mt-3 flex items-center gap-1.5 text-[12px]" style={{ color: status.color }}>
                    <status.Icon size={13} strokeWidth={2} aria-hidden="true" />
                    {status.label}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </>
  )
}
