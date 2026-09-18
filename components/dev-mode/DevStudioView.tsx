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
  Mic, Pencil, ArrowRight, CheckCircle2,
  Video, VideoOff, Dices,
} from "lucide-react"
import { useOsgardStore, type OsgardProject } from "@/lib/store/osgard-store"
import { ProjectCreateWizard } from "@/components/project-create-wizard"
import { VoiceInputButton } from "@/components/voice-input-button"
import { useVoice } from "@/lib/hooks/useVoice"
import { apiClient } from "@/lib/api-client"

/** Живые реплики-приветствия агентов при входе в студию — парасоциальная
 *  оживлённость интерфейса без затрат на инфраструктуру (просто текст,
 *  один случайный выбор на монтирование, без поллинга и WebRTC). */
const AGENT_GREETINGS = [
  { agent: "ДЖАРВИС", text: "Готов собрать первую версию за пару минут — просто опишите идею." },
  { agent: "ВАЛЛИ", text: "Если понадобится живой пример — заходите в Комнату, покажу артефакты." },
  { agent: "БЛИЗНЕЦ", text: "Голос работает не хуже текста — можно просто рассказать, что нужно." },
]

const IDEA_SPARKS = [
  { label: "Сайт кофейни", value: "Сайт кофейни с меню и бронированием столиков" },
  { label: "Трекер привычек", value: "Трекер привычек с дневным планом и серией" },
  { label: "SaaS для фрилансеров", value: "SaaS для фрилансеров с задачами, счетами и клиентами" },
  { label: "Telegram-бот", value: "Telegram-бот для записи на консультации с напоминаниями" },
]
const LUCKY_IDEAS = [
  "Интерактивная карта тихих мест города с отзывами и маршрутами",
  "Приложение для обмена домашними растениями между соседями",
  "Портфолио фотографа с бронированием съёмки",
  "Планировщик путешествия с бюджетом и чек-листом",
]

const CREATIVE_QUESTS = [
  "Сделай приложение, которое решает одну экологическую проблему",
  "Добавь Telegram-интеграцию в новый проект",
  "Собери лендинг, который можно показать клиенту сегодня",
]
type ServerQuest = { key: string; title: string; reward: number; progress: number; completed: boolean }

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
  const [questDone, setQuestDone] = useState(false)
  const [serverQuest, setServerQuest] = useState<ServerQuest | null>(null)
  const [sharing, setSharing] = useState(false)
  const shareVideoRef = useRef<HTMLVideoElement>(null)
  const canCreateProject = idea.trim().length > 0

  useEffect(() => {
    apiClient.get<{ quests: ServerQuest[] }>("/quests/today", { skipAuthRedirect: true })
      .then(({ quests }) => {
        const quest = quests[0] ?? null
        setServerQuest(quest)
        setQuestDone(Boolean(quest?.completed))
      })
      .catch(() => {
        const key = `osgard-quest-${new Date().toISOString().slice(0, 10)}`
        setQuestDone(window.localStorage.getItem(key) === "done")
      })
  }, [])
  const dailyQuest = serverQuest?.title ?? CREATIVE_QUESTS[new Date().getDate() % CREATIVE_QUESTS.length]

  async function toggleScreenShare() {
    if (sharing) {
      const stream = shareVideoRef.current?.srcObject as MediaStream | null
      stream?.getTracks().forEach((track) => track.stop())
      if (shareVideoRef.current) shareVideoRef.current.srcObject = null
      setSharing(false)
      return
    }
    if (!navigator.mediaDevices?.getDisplayMedia) return
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
      if (shareVideoRef.current) {
        shareVideoRef.current.srcObject = stream
        await shareVideoRef.current.play().catch(() => undefined)
      }
      stream.getVideoTracks()[0]?.addEventListener("ended", () => setSharing(false), { once: true })
      setSharing(true)
    } catch {
      setSharing(false)
    }
  }

  // Один случайный выбор на монтирование — не меняется при ре-рендерах экрана.
  const [greeting] = useState(() => AGENT_GREETINGS[Math.floor(Math.random() * AGENT_GREETINGS.length)])

  function startProjectCreation() {
    if (!canCreateProject) return
    setWizardOpen(true)
  }

  /* ── Голос как полноценный вход, а не кнопка сбоку ──
     Раньше распознанное молча дописывалось в textarea: человек говорил
     и не понимал, услышали ли его и что именно разобрали. Теперь речь
     попадает в отдельную карточку-расшифровку с явным подтверждением
     («Создать проект») или правкой («Исправить»). Текст один и тот же — поле
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
        <h1 className="dev-title text-[30px] leading-tight md:text-[38px]">Какой проект создаём?</h1>
        <p className="mt-2 text-[14px]" style={{ color: "rgb(148 163 184 / 90%)" }}>
          Опишите идею голосом или текстом — OSGARD создаст проект и подготовит его к развитию.
        </p>

        <p
          className="mt-3 inline-flex items-center gap-2 text-[13px]"
          style={{ color: "rgb(148 163 184 / 75%)" }}
        >
          <Sparkles size={13} strokeWidth={1.75} style={{ color: "#d7ae57" }} aria-hidden="true" />
          <span style={{ color: "#d7ae57", fontWeight: 500 }}>{greeting.agent}:</span> {greeting.text}
        </p>

        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3" aria-label="Агенты просыпаются">
          {AGENT_GREETINGS.map((entry, index) => (
            <div key={entry.agent} className="dev-card flex items-start gap-2.5 px-3 py-2.5" style={{ animation: `dev-agent-awaken 700ms ease ${index * 140}ms both` }}>
              <span className="mt-1 size-2 shrink-0 rounded-full" style={{ background: index === 0 ? "#F5C451" : index === 1 ? "#7DD3FC" : "#C4B5FD" }} />
              <span className="min-w-0 text-[12px] leading-relaxed" style={{ color: "rgb(226 232 240 / 88%)" }}>
                <strong style={{ color: "#F5C451" }}>{entry.agent}</strong> · {entry.text}
              </span>
            </div>
          ))}
        </div>

        <div className="dev-card mt-4 flex flex-wrap items-center gap-3 px-4 py-3" style={{ borderColor: sharing ? "rgb(125 211 252 / 45%)" : "rgb(148 163 184 / 18%)" }}>
          <button type="button" className="dev-btn dev-btn--ghost text-[12px]" onClick={toggleScreenShare}>
            {sharing ? <VideoOff size={14} aria-hidden="true" /> : <Video size={14} aria-hidden="true" />}
            {sharing ? "Остановить показ" : "Показать экран"}
          </button>
          <span className="text-[12px]" style={{ color: "rgb(148 163 184 / 80%)" }}>
            {sharing ? "Живой экран виден только вам в этой сессии" : "Поделитесь экраном во время показа результата"}
          </span>
          {sharing ? (
            <div className="relative mt-2 w-full overflow-hidden rounded-md border border-slate-700 bg-black">
              <video ref={shareVideoRef} muted playsInline className="max-h-40 w-full object-contain" aria-label="Предпросмотр экрана" />
              <span className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/80 px-2 py-1 text-[10px] font-medium" style={{ color: "#F5C451" }}>
                OSGARD STUDIO · osgard.io/studio
              </span>
            </div>
          ) : null}
        </div>

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
        <div className="mt-3 flex flex-wrap gap-2" aria-label="Искры идей">
          {IDEA_SPARKS.map((spark) => (
            <button key={spark.label} type="button" className="dev-btn dev-btn--ghost text-[12px]" onClick={() => { setIdea(spark.value); setHeard(null) }}>
              <Sparkles size={13} strokeWidth={1.7} aria-hidden="true" />
              {spark.label}
            </button>
          ))}
          <button type="button" className="dev-btn dev-btn--gold text-[12px]" onClick={() => {
            setIdea(LUCKY_IDEAS[Math.floor(Math.random() * LUCKY_IDEAS.length)])
            setHeard(null)
            window.setTimeout(() => setWizardOpen(true), 260)
          }}>
            <Dices size={13} strokeWidth={1.8} aria-hidden="true" />
            Мне повезёт
          </button>
        </div>

        <div className="dev-card mt-5 flex flex-wrap items-center justify-between gap-3 px-4 py-3.5" style={{ borderColor: "rgb(245 196 81 / 28%)" }}>
          <div className="flex items-start gap-3">
            <Sparkles size={17} className="mt-0.5 shrink-0" style={{ color: "#F5C451" }} aria-hidden="true" />
            <div>
              <p className="text-[11px] uppercase tracking-[0.12em]" style={{ color: "rgb(245 196 81 / 75%)" }}>Квест дня</p>
              <p className="mt-1 text-[13px]" style={{ color: "#F1F5F9" }}>{dailyQuest}</p>
            </div>
          </div>
          <button
            type="button"
            className="dev-btn dev-btn--ghost shrink-0 text-[12px]"
            onClick={() => {
              setIdea(dailyQuest)
              if (!serverQuest) {
                setQuestDone(true)
                window.localStorage.setItem(`osgard-quest-${new Date().toISOString().slice(0, 10)}`, "done")
              }
            }}
          >
            {questDone ? <CheckCircle2 size={14} aria-hidden="true" /> : <ArrowRight size={14} aria-hidden="true" />}
            {questDone ? "Квест выбран" : "Взять квест"}
          </button>
        </div>

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
                onClick={startProjectCreation}
                className="dev-btn dev-btn--gold"
                aria-label="Всё верно — перейти к созданию приложения"
              >
                Создать проект
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
            пятном и спорила бы с основным действием «Создать проект». */}
        {heard && !voice.isListening ? null : (
          <button
            type="button"
            onClick={startProjectCreation}
            disabled={!canCreateProject}
            className="dev-btn dev-btn--gold mt-4 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Создать проект по описанию идеи"
          >
            <Sparkles size={16} strokeWidth={1.75} aria-hidden="true" />
            {canCreateProject ? "Создать проект" : "Сначала опишите проект"}
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
            if (serverQuest && !serverQuest.completed) {
              apiClient.post(`/quests/${serverQuest.key}/complete`, { projectId })
                .then(() => setQuestDone(true))
                .catch(() => undefined)
            }
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
