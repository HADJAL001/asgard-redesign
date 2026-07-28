"use client"

/* ================================================================
   OSGARD · DevStudioView — главный (и единственный) экран студии.
   ----------------------------------------------------------------
   Принцип: на экране ровно один следующий шаг. Опиши идею словом или
   голосом → одна золотая кнопка → проект. Ниже — свои проекты.

   Что здесь СОЗНАТЕЛЬНО отсутствует по сравнению с обычным режимом
   (components/projects-view.tsx): плитки «Артефактов / Продано /
   Доход», значения TimeCoin, бейджи редкости, ссылки на Кузницу,
   Маркет, Биржу, Зал Славы. Экономика не «спрятана под флаг» — её
   просто нет в этой ветке рендера.

   Переиспользуем без изменений:
   • useOsgardStore().fetchProjects — тот же источник правды, что и в
     обычном режиме (никакого второго списка проектов);
   • ProjectCreateWizard — тот же мастер генерации;
   • VoiceInputButton + useVoice — тот же голосовой ввод, что на вебе.
   ================================================================ */

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Sparkles, FolderKanban, CircleCheck, CircleAlert, CircleDashed } from "lucide-react"
import { useOsgardStore, type OsgardProject } from "@/lib/store/osgard-store"
import { ProjectCreateWizard } from "@/components/project-create-wizard"
import { VoiceInputButton } from "@/components/voice-input-button"
import { useVoice } from "@/lib/hooks/useVoice"

/** Человеческий статус проекта — без экономических метрик.
 *  Формулировки честные: «Собирается» не обещает успех заранее. */
function statusOf(project: OsgardProject): { label: string; color: string; Icon: typeof CircleCheck } {
  if (project.status === "generating") return { label: "Собирается", color: "#7DD3FC", Icon: CircleDashed }
  if (project.status === "failed") return { label: "Нужен ремонт", color: "#FBBF24", Icon: CircleAlert }
  return { label: "Готов", color: "#86EFAC", Icon: CircleCheck }
}

export function DevStudioView() {
  const router = useRouter()
  const { projects, fetchProjects, loading, error } = useOsgardStore()
  const [idea, setIdea] = useState("")
  const [wizardOpen, setWizardOpen] = useState(false)

  // Голос дописывает в то же поле, что и клавиатура — один вход, не два.
  const voice = useVoice((text) => setIdea((prev) => (prev ? `${prev} ${text}` : text)))

  useEffect(() => {
    fetchProjects({ skipAuthRedirect: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      {/* ── Главное действие ── */}
      <section className="pt-6 md:pt-10">
        <h1 className="dev-title text-[30px] leading-tight md:text-[38px]">Что построим?</h1>
        <p className="mt-2 text-[14px]" style={{ color: "rgb(148 163 184 / 90%)" }}>
          Опишите приложение словами — голосом или текстом. Агенты соберут настоящий код.
        </p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-start">
          <label htmlFor="dev-idea" className="sr-only">
            Описание приложения, которое нужно создать
          </label>
          <textarea
            id="dev-idea"
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            rows={3}
            placeholder="Например: сайт кофейни с меню и бронированием столика"
            className="dev-input flex-1 resize-none px-4 py-3.5 text-[15px]"
          />
          <div className="flex items-center gap-3 sm:flex-col sm:pt-1">
            {voice.supported ? (
              <VoiceInputButton
                isListening={voice.isListening}
                onPress={voice.isListening ? voice.stop : voice.start}
                error={voice.error}
                language={voice.language}
                onCycleLanguage={voice.cycleLanguage}
              />
            ) : null}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setWizardOpen(true)}
          className="dev-btn dev-btn--gold mt-4"
          aria-label="Создать проект — открыть мастер генерации приложения"
        >
          <Sparkles size={16} strokeWidth={1.75} aria-hidden="true" />
          Создать проект
        </button>
      </section>

      {/* ── Свои проекты ── */}
      <section className="mt-14">
        <h2 className="dev-title text-[17px] tracking-[0.06em]">Мои проекты</h2>

        {loading && projects.length === 0 ? (
          <div className="mt-8 flex items-center gap-2.5" role="status">
            <Loader2 size={18} className="animate-spin" style={{ color: "#94A3B8" }} aria-hidden="true" />
            <span className="text-[14px]" style={{ color: "rgb(148 163 184 / 90%)" }}>
              Загружаем проекты…
            </span>
          </div>
        ) : null}

        {error && !loading ? (
          <p className="mt-6 text-[13px]" role="status" style={{ color: "#FBBF24" }}>
            {error}
          </p>
        ) : null}

        {!loading && projects.length === 0 ? (
          <div
            className="mt-6 flex flex-col items-center gap-3 rounded-2xl px-6 py-14 text-center"
            style={{ border: "1px dashed rgb(226 232 240 / 18%)" }}
          >
            <FolderKanban size={34} strokeWidth={1.25} style={{ color: "#64748B" }} aria-hidden="true" />
            <p className="text-[14px]" style={{ color: "rgb(148 163 184 / 90%)" }}>
              Пока ни одного проекта. Опишите идею выше — и он появится здесь.
            </p>
          </div>
        ) : null}

        {projects.length > 0 ? (
          <ul className="mt-6 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => {
              const status = statusOf(project)
              return (
                <li key={project.id}>
                  <button
                    type="button"
                    onClick={() => router.push(`/projects/${project.id}`)}
                    className="dev-card w-full cursor-pointer p-4 text-left"
                    aria-label={`Проект ${project.name}. Статус: ${status.label}. Открыть Мастерскую`}
                  >
                    <p className="text-[15px] font-medium" style={{ color: "#F1F5F9" }}>
                      {project.name}
                    </p>
                    {project.description ? (
                      <p
                        className="mt-1.5 line-clamp-2 text-[13px]"
                        style={{ color: "rgb(148 163 184 / 85%)" }}
                      >
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
      </section>

      {wizardOpen ? (
        <ProjectCreateWizard
          initialDescription={idea}
          onClose={() => setWizardOpen(false)}
          onCreated={(projectId: number) => {
            setWizardOpen(false)
            setIdea("")
            // Тот же маршрут, что и в обычном режиме: сразу внутрь Мастерской,
            // где человек видит рождение приложения (см. projects-view.tsx).
            router.push(`/projects/${projectId}/workspace`)
          }}
        />
      ) : null}
    </>
  )
}
