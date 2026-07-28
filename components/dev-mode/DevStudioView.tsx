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

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Loader2, Sparkles, FolderKanban, CircleCheck, CircleAlert, CircleDashed,
  Mic, Pencil, ArrowRight,
} from "lucide-react"
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

  /* ── Голос как полноценный вход, а не кнопка сбоку ──
     Раньше распознанное молча дописывалось в textarea: человек говорил
     и не понимал, услышали ли его и что именно разобрали. Теперь речь
     попадает в отдельную карточку-расшифровку с явным подтверждением
     («Собрать») или правкой («Исправить»). Текст один и тот же — поле
     ввода остаётся источником правды, карточка лишь показывает, что
     пришло голосом, и предлагает следующий шаг. */
  const [heard, setHeard] = useState<string | null>(null)
  const ideaFieldRef = useRef<HTMLTextAreaElement>(null)

  const voice = useVoice((text) => {
    const clean = text.trim()
    if (!clean) return
    setIdea((prev) => (prev ? `${prev} ${clean}` : clean))
    setHeard(clean)
  })

  /** Правка голосового: убираем карточку и отдаём фокус полю с курсором в конце. */
  function editHeard() {
    setHeard(null)
    const field = ideaFieldRef.current
    if (!field) return
    field.focus()
    field.setSelectionRange(field.value.length, field.value.length)
  }

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
            ref={ideaFieldRef}
            value={idea}
            onChange={(e) => {
              setIdea(e.target.value)
              // Ручная правка делает карточку расшифровки неактуальной.
              if (heard) setHeard(null)
            }}
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

        {/* Слушаю — человек должен видеть, что микрофон правда работает. */}
        {voice.isListening ? (
          <p
            className="mt-3 inline-flex items-center gap-2 text-[13.5px]"
            role="status"
            style={{ color: "#7DD3FC" }}
          >
            <Mic size={14} strokeWidth={1.75} className="animate-pulse" aria-hidden="true" />
            Говорите — я слушаю…
          </p>
        ) : null}

        {/* Расшифровка: что именно услышано и что с этим делать дальше. */}
        {heard && !voice.isListening ? (
          <div className="dev-card mt-4 p-4" role="status">
            <p className="text-[12px] uppercase tracking-[0.08em]" style={{ color: "rgb(148 163 184 / 80%)" }}>
              Услышал
            </p>
            <p className="mt-1.5 text-[15px]" style={{ color: "#F1F5F9" }}>
              «{heard}»
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => setWizardOpen(true)}
                className="dev-btn dev-btn--gold"
                aria-label="Всё верно — перейти к созданию приложения"
              >
                Собрать
                <ArrowRight size={15} strokeWidth={1.75} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={editHeard}
                className="dev-btn dev-btn--ghost"
                aria-label="Исправить распознанный текст вручную"
              >
                <Pencil size={14} strokeWidth={1.75} aria-hidden="true" />
                Исправить
              </button>
            </div>
          </div>
        ) : null}

        {/* Пока расшифровка на экране, эта кнопка была бы вторым золотым
            пятном и спорила бы с «Собрать» за внимание. */}
        {heard && !voice.isListening ? null : (
          <button
            type="button"
            onClick={() => setWizardOpen(true)}
            className="dev-btn dev-btn--gold mt-4"
            aria-label="Создать проект — открыть мастер генерации приложения"
          >
            <Sparkles size={16} strokeWidth={1.75} aria-hidden="true" />
            Создать проект
          </button>
        )}
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
                    onClick={() => router.push(`/dev/workspace/${project.id}`)}
                    className="dev-card w-full cursor-pointer p-4 text-left"
                    aria-label={`Проект ${project.name}. Статус: ${status.label}. Открыть код и превью`}
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
            setHeard(null)
            // Тот же сценарий, что и в обычном режиме (сразу внутрь Мастерской,
            // где видно рождение приложения), но роутом студии: с /projects/...
            // человек вывалился бы обратно в мир с его навигацией.
            router.push(`/dev/workspace/${projectId}`)
          }}
        />
      ) : null}
    </>
  )
}
