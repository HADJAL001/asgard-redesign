"use client"

/* ================================================================
   OSGARD · DevAgentsView — «кто и над чем работает прямо сейчас».
   ----------------------------------------------------------------
   Раздел отвечает на единственный вопрос человека, пока собирается его
   приложение: что происходит и надо ли ждать. Поэтому наверху — только
   активные сборки с ЖИВОЙ стадией из SSE, а завершённые уходят вниз
   сводкой.

   Честность важнее красоты: если проект не собирается, здесь не
   рисуется выдуманная активность — агент показан как «ждёт». Стадия
   берётся из реального потока (hooks/useProjectGenerationStream), а
   не из таймера, поэтому «Пишет код» означает, что бэкенд правда на
   этой стадии.

   Почему подписка живёт в дочернем компоненте AgentRow: хук нельзя
   вызывать в цикле по проектам (правила хуков), а активных сборок
   может быть несколько одновременно. Один ряд — одна подписка.
   ================================================================ */

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  Bot, Loader2, CheckCircle2, XCircle, Sparkles, ArrowRight, MoonStar,
} from "lucide-react"
import { useOsgardStore, type OsgardProject } from "@/lib/store/osgard-store"
import { useProjectGenerationStream } from "@/hooks/useProjectGenerationStream"
import { LiveGenerationMeter } from "./GenerationMeter"

/** Человеческие подписи стадий бэкенда. Стадия приходит и с готовым
 *  label от сервера — его и предпочитаем; этот словарь нужен на случай
 *  пустого label и чтобы не показывать сырое `analyzing`. */
const STAGE_LABEL: Record<string, string> = {
  analyzing: "Разбирает замысел",
  designing: "Продумывает устройство",
  template: "Подбирает основу",
  ai: "Пишет код",
  validating: "Проверяет написанное",
  building: "Собирает приложение",
  repairing: "Чинит найденное",
  writing: "Записывает файлы",
  ready: "Готово",
  failed: "Не получилось",
}

/* ── Один активный агент: живая подписка на поток своей сборки ── */
function AgentRow({ project }: { project: OsgardProject }) {
  const router = useRouter()
  const { fetchProjects } = useOsgardStore()

  // Терминальная стадия — перечитываем список: карточка сама уедет в «сделано».
  const stream = useProjectGenerationStream(project.id, project.status === "generating", () => {
    fetchProjects({ skipAuthRedirect: true })
  })

  const stageLabel =
    stream.latest?.label ||
    (stream.latest ? STAGE_LABEL[stream.latest.stage] : null) ||
    "Начинает работу"

  // Прогресс показываем только когда он реально пришёл: полоска на 0%
  // выглядит как «зависло», хотя поток может ещё не отдать первую стадию.
  const percent = stream.progress > 0 ? Math.round(stream.progress * 100) : null

  return (
    <li className="dev-card p-4">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl"
          style={{ background: "rgb(125 211 252 / 12%)", border: "1px solid rgb(125 211 252 / 30%)" }}
        >
          <Loader2 size={16} className="animate-spin" style={{ color: "#7DD3FC" }} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <p className="text-[15px] font-medium" style={{ color: "#F1F5F9" }}>
              {project.name}
            </p>
            <span className="text-[12px]" style={{ color: "rgb(148 163 184 / 80%)" }}>
              Клод · агент сборки
            </span>
          </div>

          <p className="mt-1 text-[13.5px]" style={{ color: "#7DD3FC" }}>
            {stageLabel}
            {stream.latest?.fileCount ? ` · файлов: ${stream.latest.fileCount}` : ""}
          </p>

          {/* Расход тикает прямо здесь, пока идёт сборка: сколько это уже
              стоило человеку, видно ДО того, как счёт закрыт. Именно это
              претензия №1 к конкурентам — цена выясняется постфактум. */}
          <LiveGenerationMeter
            meter={stream.meter}
            startedAt={stream.stages[0]?.at ?? null}
            active={!stream.done}
            compact
          />

          {percent !== null ? (
            <div
              className="mt-3 h-1 w-full overflow-hidden rounded-full"
              style={{ background: "rgb(226 232 240 / 10%)" }}
              role="progressbar"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Прогресс сборки проекта ${project.name}`}
            >
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{ width: `${percent}%`, background: "linear-gradient(90deg, #7DD3FC, #E2E8F0)" }}
              />
            </div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => router.push(`/dev/workspace/${project.id}`)}
          className="dev-btn dev-btn--ghost shrink-0"
          style={{ padding: "8px 12px" }}
          aria-label={`Открыть код проекта ${project.name}`}
        >
          Смотреть
          <ArrowRight size={14} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
    </li>
  )
}

/* ── Завершённый проект: короткая строка-итог без прогресса ── */
function DoneRow({ project }: { project: OsgardProject }) {
  const router = useRouter()
  const failed = project.status === "failed"

  return (
    <li>
      <button
        type="button"
        onClick={() => router.push(`/dev/workspace/${project.id}`)}
        className="dev-card flex w-full cursor-pointer items-center gap-3 p-3.5 text-left"
        aria-label={`Проект ${project.name}: ${failed ? "нужен ремонт" : "готов"}. Открыть код`}
      >
        {failed ? (
          <XCircle size={16} strokeWidth={1.75} style={{ color: "#FBBF24", flexShrink: 0 }} aria-hidden="true" />
        ) : (
          <CheckCircle2 size={16} strokeWidth={1.75} style={{ color: "#86EFAC", flexShrink: 0 }} aria-hidden="true" />
        )}
        <span className="min-w-0 flex-1 truncate text-[14px]" style={{ color: "#F1F5F9" }}>
          {project.name}
        </span>
        <span className="shrink-0 text-[12px]" style={{ color: failed ? "#FBBF24" : "rgb(148 163 184 / 85%)" }}>
          {failed ? "нужен ремонт" : "готов"}
        </span>
      </button>
    </li>
  )
}

export function DevAgentsView() {
  const router = useRouter()
  const { projects, fetchProjects, loading } = useOsgardStore()

  useEffect(() => {
    fetchProjects({ skipAuthRedirect: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const working = projects.filter((p) => p.status === "generating")
  const finished = projects.filter((p) => p.status !== "generating")

  return (
    <>
      <section className="pt-2">
        <h1 className="dev-title text-[26px] leading-tight md:text-[32px]">Агенты</h1>
        <p className="mt-2 text-[14px]" style={{ color: "rgb(148 163 184 / 90%)" }}>
          {working.length > 0
            ? `Сейчас в работе: ${working.length}. Стадия обновляется вживую.`
            : "Сейчас никто не занят — опишите идею в Студии, и агенты возьмутся за дело."}
        </p>
      </section>

      {loading && projects.length === 0 ? (
        <div className="mt-8 flex items-center gap-2.5" role="status">
          <Loader2 size={18} className="animate-spin" style={{ color: "#94A3B8" }} aria-hidden="true" />
          <span className="text-[14px]" style={{ color: "rgb(148 163 184 / 90%)" }}>
            Смотрим, кто чем занят…
          </span>
        </div>
      ) : null}

      {working.length > 0 ? (
        <ul className="mt-7 grid list-none grid-cols-1 gap-3 p-0">
          {working.map((project) => (
            <AgentRow key={project.id} project={project} />
          ))}
        </ul>
      ) : null}

      {/* Пустое состояние показываем, только когда пусто ВООБЩЕ —
          иначе оно спорило бы со списком завершённых ниже. */}
      {!loading && projects.length === 0 ? (
        <div
          className="mt-7 flex flex-col items-center gap-3 rounded-2xl px-6 py-14 text-center"
          style={{ border: "1px dashed rgb(226 232 240 / 18%)" }}
        >
          <Bot size={34} strokeWidth={1.25} style={{ color: "#64748B" }} aria-hidden="true" />
          <p className="text-[14px]" style={{ color: "rgb(148 163 184 / 90%)" }}>
            Агентам пока нечего делать.
          </p>
          <button type="button" onClick={() => router.push("/dev")} className="dev-btn dev-btn--gold mt-1">
            <Sparkles size={16} strokeWidth={1.75} aria-hidden="true" />
            Описать идею
          </button>
        </div>
      ) : null}

      {working.length === 0 && projects.length > 0 ? (
        <div
          className="mt-7 flex items-center gap-3 rounded-2xl px-5 py-6"
          style={{ border: "1px dashed rgb(226 232 240 / 16%)" }}
        >
          <MoonStar size={20} strokeWidth={1.4} style={{ color: "#64748B", flexShrink: 0 }} aria-hidden="true" />
          <p className="text-[13.5px]" style={{ color: "rgb(148 163 184 / 88%)" }}>
            Все агенты свободны. Ничего не собирается прямо сейчас.
          </p>
        </div>
      ) : null}

      {finished.length > 0 ? (
        <section className="mt-12">
          <h2 className="dev-title text-[16px] tracking-[0.06em]">Уже сделано</h2>
          <ul className="mt-4 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2">
            {finished.map((project) => (
              <DoneRow key={project.id} project={project} />
            ))}
          </ul>
        </section>
      ) : null}
    </>
  )
}
