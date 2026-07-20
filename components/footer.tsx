import Link from "next/link"

const FOOTER_LINKS = [
  {
    title: "Платформа",
    links: [
      { label: "Кузница", href: "/forge" },
      { label: "Маркетплейс", href: "/marketplace" },
      { label: "Биржа", href: "/exchange" },
      { label: "Стейкинг", href: "/stake" },
    ],
  },
  {
    title: "Сообщество",
    links: [
      { label: "Проекты", href: "/projects" },
      { label: "Зал Славы", href: "/hall-of-fame" },
      { label: "Лидеры", href: "/leaderboard" },
      { label: "Реферальная", href: "/referral" },
    ],
  },
  {
    title: "Аккаунт",
    links: [
      { label: "Кошелёк", href: "/wallet" },
      { label: "Транзакции", href: "/transactions" },
      { label: "Двойник", href: "/twin" },
      { label: "Обратная связь", href: "/feedback" },
    ],
  },
]

export function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer
      style={{
        background: "linear-gradient(180deg, #0A0A0F 0%, #0A1128 100%)",
        borderTop: "1px solid rgba(229,228,226,0.08)",
      }}
    >
      {/* Разделитель с неоновым свечением */}
      <div
        style={{
          height: 1,
          background: "linear-gradient(90deg, transparent, rgba(45,125,210,0.5) 30%, rgba(106,90,205,0.5) 70%, transparent)",
        }}
      />

      <div className="mx-auto max-w-[1240px] px-6 py-12 md:px-10">
        {/* Верхняя часть — лого + колонки ссылок */}
        <div className="grid grid-cols-1 gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          {/* Лого + описание */}
          <div>
            <Link href="/" className="inline-flex items-baseline gap-2 transition-opacity hover:opacity-80">
              <span
                style={{
                  fontSize: 20,
                  fontWeight: 600,
                  letterSpacing: "0.18em",
                  background: "linear-gradient(135deg, #C9A84C 0%, #E5D4A0 50%, #C9A84C 100%)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                  filter: "drop-shadow(0 0 10px rgba(201,168,76,0.4))",
                }}
              >
                OSGARD
              </span>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 300,
                  letterSpacing: "0.28em",
                  color: "#E5E4E2",
                  opacity: 0.85,
                }}
              >
                NEW WORLD
              </span>
            </Link>

            <p
              className="mt-4 text-[13px] leading-relaxed"
              style={{ color: "rgba(229,228,226,0.45)", maxWidth: 240 }}
            >
              Премиальная AI-платформа нового мира. Создавай артефакты, торгуй, развивайся в цифровой вселенной.
            </p>

            {/* Декоративный неон-градиент бар */}
            <div
              className="mt-6 h-0.5 w-16 rounded-full"
              style={{
                background: "linear-gradient(90deg, #C9A84C, #2D7DD2)",
                boxShadow: "0 0 8px rgba(45,125,210,0.5)",
              }}
            />
          </div>

          {/* Колонки ссылок */}
          {FOOTER_LINKS.map((col) => (
            <div key={col.title}>
              <p
                className="mb-4 text-[11px] font-semibold uppercase tracking-[0.2em]"
                style={{ color: "#C9A84C" }}
              >
                {col.title}
              </p>
              <ul className="space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-[13px] transition-colors hover:text-white"
                      style={{ color: "rgba(229,228,226,0.5)" }}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Нижняя часть — копирайт */}
        <div
          className="mt-10 flex flex-col items-center justify-between gap-3 border-t pt-6 text-[12px] sm:flex-row"
          style={{ borderColor: "rgba(229,228,226,0.08)", color: "rgba(229,228,226,0.3)" }}
        >
          <span>
            © {year}{" "}
            <span style={{ color: "rgba(201,168,76,0.7)" }}>OSGARD NEW WORLD</span>
            {" "}— All rights reserved
          </span>
          <div className="flex items-center gap-1.5">
            <span
              style={{
                display: "inline-block",
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#2D7DD2",
                boxShadow: "0 0 6px #2D7DD2",
              }}
            />
            <span>Powered by TimeCoin</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
