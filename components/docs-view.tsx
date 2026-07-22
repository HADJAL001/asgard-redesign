"use client"

import { useMemo, useState } from "react"
import {
  BookOpen,
  BrainCircuit,
  Hammer,
  FolderKanban,
  MessageCircle,
  Settings as SettingsIcon,
  Search,
  X,
  Pencil,
  Download,
  Share2,
  Eye,
  Clock,
  ChevronRight,
  type LucideIcon,
} from "lucide-react"
import { Navbar } from "./navbar"

/* ---- Palette ----
   bg #0A0A0F · card #14141E · accent #00D4FF · text #FFFFFF · label #6A6A8A · border #2A2A3E */

const BG = "#0A0A0F"
const CARD = "#14141E"
const ACCENT = "#00D4FF"
const LABEL = "#6A6A8A"
const BORDER = "#2A2A3E"

type CategoryId =
  | "intro"
  | "neural"
  | "forge"
  | "projects"
  | "community"
  | "settings"

type Category = { id: CategoryId; label: string; Icon: LucideIcon }

const CATEGORIES: Category[] = [
  { id: "intro", label: "Введение", Icon: BookOpen },
  { id: "neural", label: "Нейросети", Icon: BrainCircuit },
  { id: "forge", label: "Кузница", Icon: Hammer },
  { id: "projects", label: "Проекты", Icon: FolderKanban },
  { id: "community", label: "Сообщество", Icon: MessageCircle },
  { id: "settings", label: "Настройки", Icon: SettingsIcon },
]

type Section = { heading: string; body: string }

type Article = {
  id: string
  category: CategoryId
  categoryLabel: string
  subLabel: string
  title: string
  description: string
  views: number
  updated: string
  toc: string[]
  sections: Section[]
}

const ARTICLES: Article[] = [
  {
    id: "create-project",
    category: "intro",
    categoryLabel: "Введение",
    subLabel: "Руководства",
    title: "Как создать проект",
    description: "Пошаговое руководство по созданию первого проекта в OSGARD.",
    views: 12,
    updated: "12.07.2026",
    toc: [
      "Введение",
      "Шаг 1: Создание проекта",
      "Шаг 2: Настройка нейросети",
      "Шаг 3: Добавление артефактов",
      "Заключение",
    ],
    sections: [
      {
        heading: "Введение",
        body: "Чтобы создать проект в OSGARD, выполните несколько простых шагов. Проект — это рабочее пространство, объединяющее нейросети, артефакты и ресурсы для достижения конкретной цели.",
      },
      {
        heading: "Шаг 1: Создание проекта",
        body: 'Перейдите в раздел «Проекты» и нажмите «+ Создать проект». Укажите название, описание и выберите статус. Проект появится в общем списке и станет доступен для настройки.',
      },
      {
        heading: "Шаг 2: Настройка нейросети",
        body: "Откройте созданный проект и привяжите нейросеть. Настройте параметры генерации, лимиты кредитов и режим работы. Все изменения сохраняются автоматически.",
      },
      {
        heading: "Шаг 3: Добавление артефактов",
        body: "Добавьте артефакты из инвентаря или создайте новые в Кузнице. Артефакты усиливают возможности проекта и определяют его характеристики.",
      },
      {
        heading: "Заключение",
        body: "После настройки проект готов к работе. Отслеживайте прогресс в разделе «Аналитика» и улучшайте артефакты по мере роста.",
      },
    ],
  },
  {
    id: "neural-guide",
    category: "neural",
    categoryLabel: "Нейросети",
    subLabel: "Руководства",
    title: "Руководство по нейросетям",
    description: "Как подключать, настраивать и обучать нейросети внутри платформы.",
    views: 9,
    updated: "11.07.2026",
    toc: ["Обзор", "Подключение модели", "Параметры генерации", "Лимиты кредитов"],
    sections: [
      { heading: "Обзор", body: "Нейросети — ядро OSGARD. Каждая модель обрабатывает запросы и генерирует результаты на основе заданных параметров." },
      { heading: "Подключение модели", body: "Выберите модель из каталога и привяжите её к проекту. Доступ управляется через API-ключи в настройках." },
      { heading: "Параметры генерации", body: "Настройте температуру, длину контекста и режим вывода под свою задачу." },
      { heading: "Лимиты кредитов", body: "Следите за расходом кредитов в разделе «Кошелёк». Установите лимиты, чтобы избежать перерасхода." },
    ],
  },
  {
    id: "create-artifact",
    category: "forge",
    categoryLabel: "Кузница",
    subLabel: "Артефакты",
    title: "Создание артефактов",
    description: "Как ковать новые артефакты из ресурсов в Кузнице.",
    views: 7,
    updated: "10.07.2026",
    toc: ["Что такое артефакт", "Выбор типа", "Ресурсы", "Ковка"],
    sections: [
      { heading: "Что такое артефакт", body: "Артефакт — усиливающий предмет с уникальными характеристиками: сила, защита, магия." },
      { heading: "Выбор типа", body: "В Кузнице выберите тип артефакта: нейросеть, кристалл, оружие, щит или артефакт." },
      { heading: "Ресурсы", body: "Для ковки требуются энергия, материя и кристаллы. Их количество отображается в панели ресурсов." },
      { heading: "Ковка", body: "Нажмите «Создать». После завершения артефакт появится в инвентаре." },
    ],
  },
  {
    id: "upgrade-artifact",
    category: "forge",
    categoryLabel: "Кузница",
    subLabel: "Артефакты",
    title: "Улучшение артефактов",
    description: "Повышайте уровень и характеристики артефактов в Кузнице.",
    views: 8,
    updated: "10.07.2026",
    toc: ["Зачем улучшать", "Стоимость улучшения", "Процесс"],
    sections: [
      { heading: "Зачем улучшать", body: "Улучшение повышает уровень артефакта и его характеристики, открывая новые возможности." },
      { heading: "Стоимость улучшения", body: "Каждый уровень требует ресурсов. Проверьте наличие перед началом." },
      { heading: "Процесс", body: "Откройте артефакт, нажмите «Улучшить» и подтвердите. Изменения применяются мгновенно." },
    ],
  },
  {
    id: "api-work",
    category: "settings",
    categoryLabel: "Настройки",
    subLabel: "API",
    title: "Работа с API",
    description: "Настройка API-ключей и интеграций с внешними сервисами.",
    views: 5,
    updated: "09.07.2026",
    toc: ["Создание ключа", "Использование", "Безопасность"],
    sections: [
      { heading: "Создание ключа", body: "В разделе «Настройки → API Интеграции» нажмите «Создать ключ» и задайте имя." },
      { heading: "Использование", body: "Передавайте ключ в заголовке запроса. Не публикуйте его в открытом доступе." },
      { heading: "Безопасность", body: "Отзывайте неиспользуемые ключи и регулярно обновляйте активные." },
    ],
  },
  {
    id: "tokens",
    category: "projects",
    categoryLabel: "Проекты",
    subLabel: "Ресурсы",
    title: "Управление кредитами",
    description: "Как отслеживать и распределять кредиты между проектами.",
    views: 6,
    updated: "08.07.2026",
    toc: ["Баланс кредитов", "Распределение", "Лимиты"],
    sections: [
      { heading: "Баланс кредитов", body: "Общий баланс отображается в разделе «Кошелёк». Кредиты расходуются на генерацию." },
      { heading: "Распределение", body: "Назначайте лимиты по проектам, чтобы контролировать расход." },
      { heading: "Лимиты", body: "При достижении лимита генерация приостанавливается до пополнения." },
    ],
  },
  {
    id: "security",
    category: "settings",
    categoryLabel: "Настройки",
    subLabel: "Безопасность",
    title: "Настройки безопасности",
    description: "Пароль, двухфакторная аутентификация и управление сессиями.",
    views: 4,
    updated: "07.07.2026",
    toc: ["Пароль", "Двухфакторная аутентификация", "Сессии"],
    sections: [
      { heading: "Пароль", body: "Используйте сложный пароль и меняйте его периодически в разделе «Безопасность»." },
      { heading: "Двухфакторная аутентификация", body: "Включите 2FA для дополнительной защиты аккаунта." },
      { heading: "Сессии", body: "Просматривайте активные сессии и завершайте подозрительные." },
    ],
  },
]

export function DocsView() {
  const [activeCategory, setActiveCategory] = useState<CategoryId>("intro")
  const [query, setQuery] = useState("")
  const [showAll, setShowAll] = useState(false)
  const [open, setOpen] = useState<Article | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return ARTICLES.filter((a) => {
      const matchesCategory = showAll || q ? true : a.category === activeCategory
      const matchesQuery =
        !q || a.title.toLowerCase().includes(q) || a.description.toLowerCase().includes(q)
      return matchesCategory && matchesQuery
    })
  }, [activeCategory, query, showAll])

  const popular = useMemo(() => [...ARTICLES].sort((a, b) => b.views - a.views).slice(0, 3), [])

  const countByCategory = (id: CategoryId) => ARTICLES.filter((a) => a.category === id).length

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(180deg, #0A0A0F 0%, #0D0D1A 100%)", color: "#FFFFFF" }}>
      <Navbar />

      <main className="mx-auto max-w-6xl px-6 py-10 md:px-10">
        {/* Header row */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="font-sans text-[32px] font-semibold leading-tight">Документация</h1>
            <p className="mt-1 font-sans text-[14px]" style={{ color: "#FFFFFF", opacity: 0.4 }}>
              База знаний и руководства
            </p>
          </div>

          <div
            className="flex items-center gap-2 rounded-lg px-3 py-2.5 sm:w-72"
            style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}
          >
            <Search size={16} strokeWidth={1.75} style={{ color: LABEL }} aria-hidden="true" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск..."
              aria-label="Поиск по документации"
              className="w-full bg-transparent text-[14px] outline-none placeholder:text-white/30"
              style={{ color: "#FFFFFF" }}
            />
          </div>
        </div>

        {/* Two columns */}
        <div className="mt-8 flex flex-col gap-6 lg:flex-row">
          {/* Categories */}
          <nav
            aria-label="Категории"
            className="w-full shrink-0 rounded-xl p-4 lg:w-[30%]"
            style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}
          >
            <p
              className="mb-3 px-1 text-[11px] font-medium uppercase tracking-[0.12em]"
              style={{ color: LABEL }}
            >
              Категории
            </p>
            <div className="flex flex-col gap-1">
              {CATEGORIES.map((cat) => {
                const isActive = !showAll && !query && activeCategory === cat.id
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      setActiveCategory(cat.id)
                      setShowAll(false)
                      setQuery("")
                    }}
                    aria-current={isActive ? "true" : undefined}
                    className="flex items-center gap-3 rounded-lg py-2.5 pl-3 pr-2 text-left text-[14px] transition-colors"
                    style={{
                      backgroundColor: isActive ? "rgba(0,212,255,0.08)" : "transparent",
                      borderLeft: `2px solid ${isActive ? ACCENT : "transparent"}`,
                      color: isActive ? ACCENT : "#FFFFFF",
                      opacity: isActive ? 1 : 0.7,
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) e.currentTarget.style.opacity = "1"
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) e.currentTarget.style.opacity = "0.7"
                    }}
                  >
                    <cat.Icon size={16} strokeWidth={1.75} aria-hidden="true" />
                    <span className="flex-1">{cat.label}</span>
                    <span className="text-[12px]" style={{ color: LABEL }}>
                      {countByCategory(cat.id)}
                    </span>
                  </button>
                )
              })}
            </div>

            <button
              type="button"
              onClick={() => {
                setShowAll(true)
                setQuery("")
              }}
              className="mt-3 w-full rounded-lg py-2.5 text-[13px] transition-colors"
              style={{
                border: `1px solid ${showAll ? ACCENT : BORDER}`,
                color: showAll ? ACCENT : "rgba(255,255,255,0.7)",
              }}
            >
              Все статьи
            </button>
          </nav>

          {/* Articles */}
          <section
            aria-label="Статьи"
            className="min-w-0 flex-1 rounded-xl p-4"
            style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}
          >
            <p
              className="mb-3 px-1 text-[11px] font-medium uppercase tracking-[0.12em]"
              style={{ color: LABEL }}
            >
              Статьи
            </p>

            {filtered.length === 0 ? (
              <p className="px-1 py-8 text-center text-[14px]" style={{ color: LABEL }}>
                Ничего не найдено
              </p>
            ) : (
              <ul className="flex flex-col">
                {filtered.map((a, i) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => setOpen(a)}
                      className="group flex w-full items-center gap-4 rounded-lg px-3 py-4 text-left transition-colors"
                      style={{
                        borderTop: i === 0 ? "none" : `1px solid ${BORDER}`,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(0,212,255,0.05)")}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-[16px]" style={{ color: "#FFFFFF" }}>
                          {a.title}
                        </p>
                        <p className="mt-1 truncate text-[14px]" style={{ color: "#FFFFFF", opacity: 0.5 }}>
                          {a.description}
                        </p>
                        <div
                          className="mt-1.5 flex items-center gap-1.5 text-[12px]"
                          style={{ color: "#FFFFFF", opacity: 0.3 }}
                        >
                          <Eye size={12} strokeWidth={1.75} aria-hidden="true" />
                          {a.views} просмотров
                        </div>
                      </div>
                      <ChevronRight
                        size={18}
                        strokeWidth={1.75}
                        className="shrink-0 transition-transform group-hover:translate-x-0.5"
                        style={{ color: LABEL }}
                        aria-hidden="true"
                      />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Popular articles */}
        <section
          aria-label="Популярные статьи"
          className="mt-6 rounded-xl p-4"
          style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}
        >
          <p
            className="mb-3 px-1 text-[11px] font-medium uppercase tracking-[0.12em]"
            style={{ color: LABEL }}
          >
            Популярные статьи
          </p>
          <ol className="flex flex-col gap-2">
            {popular.map((a, i) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => setOpen(a)}
                  className="flex w-full items-center gap-4 rounded-lg px-3 py-3 text-left transition-colors"
                  style={{ border: `1px solid ${BORDER}` }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = ACCENT)}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = BORDER)}
                >
                  <span
                    className="flex size-7 shrink-0 items-center justify-center rounded-md text-[13px] font-medium"
                    style={{ backgroundColor: "rgba(0,212,255,0.1)", color: ACCENT }}
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[14px]" style={{ color: "#FFFFFF" }}>
                    {a.title}
                  </span>
                  <span
                    className="flex shrink-0 items-center gap-1.5 text-[12px]"
                    style={{ color: "#FFFFFF", opacity: 0.3 }}
                  >
                    <Eye size={12} strokeWidth={1.75} aria-hidden="true" />
                    {a.views} просмотров
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      </main>

      {open && <ArticleModal article={open} onClose={() => setOpen(null)} />}
    </div>
  )
}

function ArticleModal({ article, onClose }: { article: Article; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(5,8,20,0.7)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={article.title}
    >
      <div
        className="flex h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl"
        style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div
          className="flex shrink-0 items-center gap-3 px-6 py-4"
          style={{ borderBottom: `1px solid ${BORDER}` }}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="transition-colors hover:text-white"
            style={{ color: LABEL }}
          >
            <X size={20} strokeWidth={1.5} />
          </button>
          <h2 className="truncate text-[18px] font-semibold">{article.title}</h2>
        </div>

        {/* Scrollable body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {/* Breadcrumbs + meta */}
          <div className="flex items-center gap-2 text-[13px]" style={{ color: LABEL }}>
            <span>{article.categoryLabel}</span>
            <ChevronRight size={13} strokeWidth={1.75} aria-hidden="true" />
            <span>{article.subLabel}</span>
          </div>
          <div
            className="mt-1 flex items-center gap-1.5 text-[12px]"
            style={{ color: "#FFFFFF", opacity: 0.3 }}
          >
            <Clock size={12} strokeWidth={1.75} aria-hidden="true" />
            Последнее обновление: {article.updated}
          </div>

          {/* Table of contents */}
          <div
            className="mt-5 rounded-lg p-4"
            style={{ backgroundColor: BG, border: `1px solid ${BORDER}` }}
          >
            <p className="mb-2 text-[13px] font-medium" style={{ color: "#FFFFFF" }}>
              Содержание:
            </p>
            <ol className="flex flex-col gap-1.5">
              {article.toc.map((item, i) => (
                <li key={item} className="flex items-baseline gap-2 text-[14px]">
                  <span style={{ color: ACCENT }}>{i + 1}.</span>
                  <span style={{ color: "#FFFFFF", opacity: 0.7 }}>{item}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* Content */}
          <div className="mt-6 flex flex-col gap-6">
            {article.sections.map((s) => (
              <div key={s.heading}>
                <h3 className="text-[18px] font-semibold" style={{ color: "#FFFFFF" }}>
                  {s.heading}
                </h3>
                <p
                  className="mt-2 text-[14px] leading-relaxed"
                  style={{ color: "#FFFFFF", opacity: 0.7 }}
                >
                  {s.body}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Footer actions */}
        <div
          className="flex shrink-0 flex-wrap items-center gap-3 px-6 py-4"
          style={{ borderTop: `1px solid ${BORDER}` }}
        >
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-[14px] font-medium transition-opacity"
            style={{ backgroundColor: ACCENT, color: BG }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.9")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
          >
            <Pencil size={16} strokeWidth={1.75} />
            Редактировать
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-[14px] transition-colors"
            style={{ border: `1px solid ${BORDER}`, color: "rgba(255,255,255,0.8)" }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = ACCENT)}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = BORDER)}
          >
            <Download size={16} strokeWidth={1.75} />
            Экспорт
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-[14px] transition-colors"
            style={{ border: `1px solid ${BORDER}`, color: "rgba(255,255,255,0.8)" }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = ACCENT)}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = BORDER)}
          >
            <Share2 size={16} strokeWidth={1.75} />
            Поделиться
          </button>
        </div>
      </div>
    </div>
  )
}
