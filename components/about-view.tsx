"use client"

/* ================================================================
   AboutView — «Справка»: что за платформа, кому нужна, какие деньги
   ----------------------------------------------------------------
   Питч-страница в стиле стендапа: сначала посмеёшься, потом
   зарегистрируешься. Премиальный золотой фон + крупная типографика.
   Ссылка в верхней навигации (navbar → «Справка»).
   ================================================================ */

import Link from "next/link"
import { Sparkles, Rocket, Coins, Users, TrendingUp, Boxes, ArrowRight, Quote } from "lucide-react"
import { Navbar } from "./navbar"
import { PremiumBackground } from "./premium-bg"
import { COLORS } from "@/lib/economy"

const GOLD = "#E6C868"

function Section({ children }: { children: React.ReactNode }) {
  return <section className="mx-auto mt-16 max-w-[860px]">{children}</section>
}

function Card({ children, tint = GOLD }: { children: React.ReactNode; tint?: string }) {
  return (
    <div
      className="rounded-2xl p-6 md:p-7"
      style={{
        background: "rgba(15,18,30,0.6)",
        backdropFilter: "blur(14px)",
        border: `1px solid ${tint}33`,
        boxShadow: "0 14px 46px rgba(0,0,0,0.42)",
      }}
    >
      {children}
    </div>
  )
}

export function AboutView() {
  return (
    <div className="relative min-h-screen overflow-hidden font-sans" style={{ background: "linear-gradient(180deg, #05070f 0%, #0b1020 60%, #05070f 100%)", color: COLORS.text }}>
      <PremiumBackground variant="gold" />
      <Navbar />

      <main className="relative z-10 px-6 pb-24 pt-10 md:px-10 md:pt-14">
        {/* Hero */}
        <div className="mx-auto max-w-[860px] text-center">
          <span className="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[12px] font-semibold" style={{ border: `1px solid ${GOLD}55`, color: GOLD }}>
            <Sparkles size={14} strokeWidth={1.9} /> OSGARD · NEW WORLD
          </span>
          <h1 className="mt-6 text-[40px] font-bold leading-[1.08] md:text-[56px]">
            Ты пришёл сделать сайт.<br />
            <span style={{ color: GOLD }}>Уйдёшь с цифровой империей.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-[620px] text-[16px] leading-relaxed md:text-[18px]" style={{ color: "rgba(255,255,255,0.62)" }}>
            OSGARD — это платформа, где ИИ пишет за тебя настоящий код, а каждый проект
            рождает коллекционные артефакты, у которых есть цена. Да, ты не ослышался:
            ты создаёшь — экономика платит.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/register" className="inline-flex items-center gap-2 rounded-xl px-6 py-3 text-[14px] font-semibold transition-transform hover:scale-[1.03]" style={{ background: `linear-gradient(135deg, ${GOLD}, #C69B2E)`, color: "#1a1405" }}>
              <Rocket size={17} strokeWidth={2} /> Войти в новый мир
            </Link>
            <Link href="/docs/economy-map" className="inline-flex items-center gap-2 rounded-xl px-6 py-3 text-[14px] font-medium transition-colors" style={{ border: `1px solid ${COLORS.border}`, color: "#fff" }}>
              Как устроена экономика <ArrowRight size={16} />
            </Link>
          </div>
        </div>

        {/* Стендап-монолог */}
        <Section>
          <Card>
            <Quote size={22} style={{ color: GOLD }} />
            <div className="mt-3 space-y-4 text-[15px] leading-relaxed md:text-[16px]" style={{ color: "rgba(255,255,255,0.82)" }}>
              <p>
                Значит так. Заходишь ты на обычную платформу — там: «оплати подписку, получи 5 генераций
                и молчи». Заходишь на OSGARD — а тут: «сделай проект, лови артефакт, продай его дороже,
                застейкай прибыль и стань архитектором вселенной». Чувствуешь разницу? Одни продают тебе
                инструмент. Мы даём тебе <b style={{ color: GOLD }}>целый мир и долю в нём</b>.
              </p>
              <p>
                «А в чём подвох?» — спросишь ты, потому что ты умный, тебя на мякине не проведёшь. Подвоха
                нет. Есть механика: ИИ генерирует <b>реальный</b> код — не картинку, не имитацию, — а вместе
                с проектом на свет рождаются артефакты со статами и редкостью. Это как если бы ты запускал
                стартап, а он тебе ещё и лут выдавал. GitHub встречает Diablo. Наконец-то.
              </p>
              <p>
                «Мне-то это зачем?» Затем, что впервые твой труд не испаряется в пустоту. Каждый клик —
                это ступень доверия, каждая ступень — ближе к реальным деньгам. Кредиты → шарды → кристаллы →
                TimeCoin → доллары. Лестница, по которой поднимаются, а не с которой падают.
              </p>
            </div>
          </Card>
        </Section>

        {/* Что это / Кому / Деньги */}
        <Section>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {[
              {
                Icon: Boxes, title: "Что это такое",
                text: "ИИ-платформа, где из идеи рождается настоящее приложение и коллекционные артефакты. Кузница, маркетплейс, биржа, стейкинг, оркестратор AI-моделей и цифровой близнец — целая экономика в одном мире.",
              },
              {
                Icon: Users, title: "Кому это нужно",
                text: "Тем, кто хочет создавать, а не только потреблять: разработчикам, фаундерам, креаторам, инвесторам ранней стадии и просто смелым. Не умеешь кодить? Тем более сюда — ИИ сделает, ты — заработаешь.",
              },
              {
                Icon: TrendingUp, title: "Где деньги",
                text: "Артефакты продаются, TimeCoin имеет рыночную цену, комиссии маркета, стейкинг-доходность, реферальная программа и вывод в реальные деньги. Ранний вход = лучшая позиция в растущей экономике.",
              },
            ].map((b) => (
              <Card key={b.title}>
                <span className="flex size-11 items-center justify-center rounded-xl" style={{ border: `1px solid ${GOLD}55` }}>
                  <b.Icon size={20} strokeWidth={1.6} style={{ color: GOLD }} />
                </span>
                <h3 className="mt-4 text-[17px] font-semibold">{b.title}</h3>
                <p className="mt-2 text-[14px] leading-relaxed" style={{ color: "rgba(255,255,255,0.6)" }}>{b.text}</p>
              </Card>
            ))}
          </div>
        </Section>

        {/* Инвестиционный питч */}
        <Section>
          <Card tint={COLORS.green}>
            <div className="flex items-center gap-2">
              <Coins size={20} style={{ color: COLORS.green }} />
              <h2 className="text-[20px] font-bold">Инвестору — на языке цифр и шуток</h2>
            </div>
            <div className="mt-4 space-y-4 text-[15px] leading-relaxed" style={{ color: "rgba(255,255,255,0.82)" }}>
              <p>
                Рынок ИИ-инструментов растёт как на дрожжах, но у всех одна беда — <b>удержание</b>. Люди
                генерят картинку и уходят. У нас уйти сложно: тут твои проекты, твои артефакты, твоя
                репутация архитектора и твоя доля в экономике. Это не «ещё один AI-врапер» — это
                <b style={{ color: COLORS.green }}> платформа с собственной валютой и рынком</b>.
              </p>
              <p>
                Монетизация не в одном месте, а в пяти: подписки, комиссия маркетплейса, спред биржи,
                доходность стейкинга и премиум-ускорения. Диверсифицированный поток — инвестор любит,
                когда доход не стоит на одной ноге.
              </p>
              <p style={{ color: GOLD }}>
                Резюме одной строкой: мы превращаем «сделал и забыл» в «создал и владеешь». А владение —
                это то, за что платят. Всегда платили. И будут.
              </p>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/register" className="inline-flex items-center gap-2 rounded-xl px-6 py-3 text-[14px] font-semibold transition-transform hover:scale-[1.03]" style={{ background: `linear-gradient(135deg, ${GOLD}, #C69B2E)`, color: "#1a1405" }}>
                Занять место в мире <ArrowRight size={16} />
              </Link>
              <Link href="/pricing" className="inline-flex items-center gap-2 rounded-xl px-6 py-3 text-[14px] font-medium transition-colors" style={{ border: `1px solid ${COLORS.border}`, color: "#fff" }}>
                Посмотреть тарифы
              </Link>
            </div>
          </Card>
        </Section>

        <p className="mx-auto mt-14 max-w-[860px] text-center text-[13px] italic" style={{ color: "rgba(255,255,255,0.4)" }}>
          Спасибо, что дочитал. Обычно на этом месте люди уже нажимают «Войти в новый мир». Ты чем хуже?
        </p>
      </main>
    </div>
  )
}
