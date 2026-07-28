"use client"

/* ================================================================
   OSGARD · DevDeployView — «Деплой и адреса».
   ----------------------------------------------------------------
   Последний шаг пути разработчика: приложение собрано — где оно живёт
   и как отдать на него ссылку. Раздел собирает в одном месте то, что
   в обычном режиме разбросано по карточкам проектов.

   Публикация асинхронная: POST только запускает её (deployStatus →
   'deploying'), поэтому после вызова обязателен pollDeployStatus —
   иначе адрес не появится, пока человек не перезагрузит страницу.

   Ошибки показываем текстом рядом с проектом, а не глотаем в консоль:
   неудачный деплой без объяснения — худшее, что можно показать после
   получаса ожидания сборки.
   ================================================================ */

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  // GitBranch, а не Github: в этой версии lucide-react бренд-иконок нет
  // (их вынесли из пакета). Тот же выбор уже сделан в navbar.tsx.
  Rocket, Loader2, ExternalLink, GitBranch, CircleCheck, TriangleAlert, PackageOpen,
} from "lucide-react"
import { useOsgardStore, type OsgardProject } from "@/lib/store/osgard-store"

type RowBusy = "deploy" | "github" | null

function DeployRow({ project, primary }: { project: OsgardProject; primary: boolean }) {
  const router = useRouter()
  const { deployProjectToNetlify, pollDeployStatus, publishProjectToGithub, fetchProjects } = useOsgardStore()

  const [busy, setBusy] = useState<RowBusy>(null)
  const [error, setError] = useState<string | null>(null)
  const [repoUrl, setRepoUrl] = useState<string | null>(null)

  // Проект мог начать деплоиться в другом месте (Мастерская) — тогда
  // строка обязана показывать «публикуется», даже если кнопку жали не здесь.
  const deploying = busy === "deploy" || project.deployStatus === "deploying"
  const deployed = project.deployStatus === "deployed" && Boolean(project.liveUrl)
  const failed = project.deployStatus === "failed"

  // Публиковать можно только собранное: у 'generating'/'failed' нет файлов.
  const canDeploy = project.status === "ready" && !deploying

  async function handleDeploy() {
    setBusy("deploy")
    setError(null)
    const res = await deployProjectToNetlify(project.id)
    if (!res.success) {
      setError(res.error || "Опубликовать не удалось. Попробуйте ещё раз.")
      setBusy(null)
      return
    }
    // Ждём реального финала, иначе адрес не появится до перезагрузки.
    const finished = await pollDeployStatus(project.id)
    if (finished?.deployStatus === "failed") {
      setError(finished.deployError || "Публикация завершилась ошибкой.")
    }
    await fetchProjects({ skipAuthRedirect: true })
    setBusy(null)
  }

  async function handleGithub() {
    setBusy("github")
    setError(null)
    const res = await publishProjectToGithub(project.id)
    if (res.success && res.repoUrl) setRepoUrl(res.repoUrl)
    else setError(res.error || "Опубликовать в GitHub не удалось.")
    setBusy(null)
  }

  return (
    <li className="dev-card p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <button
              type="button"
              onClick={() => router.push(`/dev/workspace/${project.id}`)}
              className="cursor-pointer text-[15px] font-medium underline-offset-4 hover:underline"
              style={{ color: "#F1F5F9", background: "none", border: "none", padding: 0 }}
              aria-label={`Открыть код проекта ${project.name}`}
            >
              {project.name}
            </button>

            {deployed ? (
              <span className="inline-flex items-center gap-1.5 text-[12px]" style={{ color: "#86EFAC" }}>
                <CircleCheck size={13} strokeWidth={2} aria-hidden="true" />
                опубликовано
              </span>
            ) : deploying ? (
              <span className="inline-flex items-center gap-1.5 text-[12px]" style={{ color: "#7DD3FC" }}>
                <Loader2 size={13} className="animate-spin" aria-hidden="true" />
                публикуется…
              </span>
            ) : failed ? (
              <span className="inline-flex items-center gap-1.5 text-[12px]" style={{ color: "#FBBF24" }}>
                <TriangleAlert size={13} strokeWidth={2} aria-hidden="true" />
                прошлая попытка не удалась
              </span>
            ) : project.status !== "ready" ? (
              <span className="text-[12px]" style={{ color: "rgb(148 163 184 / 80%)" }}>
                ещё собирается
              </span>
            ) : (
              <span className="text-[12px]" style={{ color: "rgb(148 163 184 / 80%)" }}>
                готов к публикации
              </span>
            )}
          </div>

          {deployed && project.liveUrl ? (
            <a
              href={project.liveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1.5 inline-flex items-center gap-1.5 text-[13px] underline underline-offset-4"
              style={{ color: "#7DD3FC" }}
            >
              {project.liveUrl.replace(/^https?:\/\//, "")}
              <ExternalLink size={12} strokeWidth={1.75} aria-hidden="true" />
            </a>
          ) : null}

          {repoUrl ? (
            <a
              href={repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1.5 flex items-center gap-1.5 text-[13px] underline underline-offset-4"
              style={{ color: "#CBD5E1" }}
            >
              <GitBranch size={12} strokeWidth={1.75} aria-hidden="true" />
              исходный код на GitHub
            </a>
          ) : null}

          {error ? (
            <p className="mt-2 text-[12.5px]" role="status" style={{ color: "#FBBF24" }}>
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={handleGithub}
            disabled={busy !== null || project.status !== "ready"}
            className="dev-btn dev-btn--ghost"
            style={{ padding: "9px 12px" }}
            aria-label={`Опубликовать исходный код проекта ${project.name} в GitHub`}
          >
            {busy === "github" ? (
              <Loader2 size={14} className="animate-spin" aria-hidden="true" />
            ) : (
              <GitBranch size={14} strokeWidth={1.75} aria-hidden="true" />
            )}
            <span className="hidden sm:inline">GitHub</span>
          </button>

          <button
            type="button"
            onClick={handleDeploy}
            disabled={!canDeploy || busy !== null}
            /* Золото — только у ОДНОГО действия на экране (правило режима:
               одна точка притяжения взгляда). Шесть золотых кнопок в списке
               превращали акцент в фон — проверено на живом стенде. */
            className={primary ? "dev-btn dev-btn--gold" : "dev-btn"}
            aria-label={
              deployed
                ? `Опубликовать проект ${project.name} заново`
                : `Опубликовать проект ${project.name} в интернете`
            }
          >
            {deploying ? (
              <Loader2 size={14} className="animate-spin" aria-hidden="true" />
            ) : (
              <Rocket size={14} strokeWidth={1.75} aria-hidden="true" />
            )}
            {deployed ? "Обновить" : "Опубликовать"}
          </button>
        </div>
      </div>
    </li>
  )
}

export function DevDeployView() {
  const router = useRouter()
  const { projects, fetchProjects, loading } = useOsgardStore()

  useEffect(() => {
    fetchProjects({ skipAuthRedirect: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const live = projects.filter((p) => p.deployStatus === "deployed" && p.liveUrl)

  /* Единственное золотое действие на экране — первый проект, который готов,
     но ещё не опубликован. Именно он и есть «следующий шаг» человека. */
  const primaryId = projects.find(
    (p) => p.status === "ready" && p.deployStatus !== "deployed" && p.deployStatus !== "deploying",
  )?.id ?? null

  return (
    <>
      <section className="pt-2">
        <h1 className="dev-title text-[26px] leading-tight md:text-[32px]">Деплой и адреса</h1>
        <p className="mt-2 text-[14px]" style={{ color: "rgb(148 163 184 / 90%)" }}>
          {live.length > 0
            ? `В интернете живёт приложений: ${live.length}. Ссылку можно отдать кому угодно.`
            : "Опубликуйте приложение — и у него появится адрес, который можно открыть с любого устройства."}
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
          <PackageOpen size={34} strokeWidth={1.25} style={{ color: "#64748B" }} aria-hidden="true" />
          <p className="text-[14px]" style={{ color: "rgb(148 163 184 / 90%)" }}>
            Публиковать пока нечего — сначала создайте приложение.
          </p>
          <button type="button" onClick={() => router.push("/dev")} className="dev-btn dev-btn--gold mt-1">
            <Rocket size={16} strokeWidth={1.75} aria-hidden="true" />
            В Студию
          </button>
        </div>
      ) : null}

      {projects.length > 0 ? (
        <ul className="mt-7 grid list-none grid-cols-1 gap-3 p-0">
          {projects.map((project) => (
            <DeployRow key={project.id} project={project} primary={project.id === primaryId} />
          ))}
        </ul>
      ) : null}
    </>
  )
}
