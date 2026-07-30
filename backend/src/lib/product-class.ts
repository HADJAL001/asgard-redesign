/* ================================================================
   OSGARD · Класс продукта: что именно просят построить (волна 7, п.4)
   ----------------------------------------------------------------
   ЧЕМ ЭТО ОТЛИЧАЕТСЯ ОТ ТЕМЫ. `detectTheme` (services/template-store)
   отвечает на вопрос «во что это одето»: fantasy, scifi, cyberpunk —
   восемь тем по словарю из десяти слов. Тема — декорация. Два проекта
   одной темы могут быть магазином и чатом, и ломаются они в разных
   местах: у магазина — корзина и деньги, у чата — живой поток и
   доставка сообщений. Отбор шаблона по теме этой разницы не видит.

   КЛАСС — это то, что придётся ПОСТРОИТЬ: какие сущности хранить,
   что показывать списком, где нужен вход, где деньги, где живой
   поток. Класс выводится не из настроения текста, а из НАЗВАННЫХ
   человеком возможностей.

   ПОЧЕМУ БЕЗ AI. Доска запрещает лишний вызов модели на каждую
   генерацию: стоимость и время генерации расти не должны. Здесь чистая
   функция без БД и без сети — её можно вызвать до кнопки, в генерации и
   в тесте, и все три раза получить одно и то же. Это же требование
   делает механизм проверяемым: ответ платформы человеку и класс, под
   которым потом искали похожие генерации, обязаны совпадать.

   ЧЕСТНОЕ «НЕ ЗНАЮ». Класс `unknown` — не заглушка и не ошибка разбора,
   а факт о заявке: человек не сказал, что должно работать. Выдуманный
   класс хуже отсутствующего: под него платформа найдёт «похожие»
   генерации, и человек получит уверенный ответ, ни на чём не основанный.
   Поэтому класс объявляется только при названной возможности, а не по
   декоративным словам.
   ================================================================ */

/** Возможность, названная в заявке. Это ответ на «что должно работать», а не «про что это». */
export type Capability =
  | "auth"
  | "payments"
  | "catalog"
  | "cart"
  | "feed"
  | "comments"
  | "chat-realtime"
  | "profiles"
  | "charts"
  | "schedule"
  | "upload-media"
  | "search"
  | "geo-map"
  | "roles-admin"
  | "notifications"
  | "game-rules"
  | "crud-records"
  | "integration-api"
  | "offline"

/** Класс продукта. `unknown` — заявка не описывает функцию (см. шапку). */
export type ProductClass =
  | "catalog-commerce"
  | "content-feed"
  | "social-community"
  | "realtime-chat"
  | "dashboard-analytics"
  | "booking-schedule"
  | "tracker-crud"
  | "game-loop"
  | "showcase-landing"
  | "tool-utility"
  | "unknown"

/* Слова-признаки возможностей. Два языка, потому что заявки приходят на двух: заявка
   «интернет-магазин с корзиной» и «shop with cart» — одна и та же работа для генератора.
   Словарь намеренно узкий: широкий даёт ложные возможности, а ложная возможность — это
   уверенный неверный ответ человеку. */
const CAPABILITY_WORDS: Record<Capability, string[]> = {
  auth: ["вход", "войти", "логин", "login", "sign in", "signup", "регистрац", "авториз", "auth", "пароль", "password"],
  payments: ["оплат", "платеж", "платёж", "payment", "checkout", "stripe", "подписк", "subscription", "тариф", "billing", "деньги", "купить", "buy"],
  /* «Витрины» здесь нет намеренно: в русском (и в самом OSGARD) это слово чаще значит
     страницу-презентацию, чем каталог товаров. Ложная возможность — это уверенный
     неверный класс, а «витрина товаров» опознаётся по слову «товар». */
  catalog: ["каталог", "catalog", "товар", "product", "ассортимент", "магазин", "shop", "store", "меню блюд", "прайс"],
  cart: ["корзин", "cart", "basket", "заказ", "order"],
  feed: ["лент", "feed", "пост", "post", "стать", "article", "новост", "news", "блог", "blog", "публикац"],
  comments: ["коммент", "comment", "отзыв", "review", "оценк", "rating", "рейтинг"],
  "chat-realtime": ["чат", "chat", "сообщени", "message", "мессендж", "онлайн", "realtime", "реальном времени", "live", "трансляц", "stream"],
  profiles: ["профил", "profile", "личный кабинет", "аккаунт", "account", "подписчик", "follower", "друз", "friend", "участник", "member"],
  charts: ["график", "chart", "диаграмм", "аналитик", "analytics", "метрик", "metric", "статистик", "statistic", "дашборд", "dashboard", "отчёт", "отчет", "report"],
  schedule: ["календар", "calendar", "расписан", "schedule", "бронир", "booking", "запись на", "слот", "slot", "встреч", "appointment", "дедлайн", "deadline"],
  "upload-media": ["загрузк", "upload", "фото", "photo", "изображени", "image", "видео", "video", "галере", "gallery", "файл", "file"],
  search: ["поиск", "search", "фильтр", "filter", "сортиров", "sort"],
  /* «карт» здесь нет: живой прострел показал, что «оплата картой» опознавалась как карта
     местности — и человеку показывалось слово-основание «карт» рядом с возможностью
     «карта». Тот же корень у «карточки товара». Ложное основание хуже отсутствующего:
     оно выглядит как доказательство. Гео опознаём по формам, которых у банковской карты
     и карточки товара нет. */
  "geo-map": ["на карте", "карта город", "карте город", "map", "геолокац", "geo", "адрес", "address", "маршрут", "route", "доставк", "delivery"],
  "roles-admin": ["админ", "admin", "модерац", "moderation", "роль", "role", "права", "permission", "владелец", "owner"],
  notifications: ["уведомлен", "notification", "напоминан", "reminder", "push", "email рассылк", "рассылк"],
  "game-rules": ["игр", "game", "уровен", "level", "очк", "score", "бой", "battle", "квест", "quest", "побед", "win", "правила игры", "лидерборд", "leaderboard"],
  "crud-records": ["список", "list", "запис", "record", "задач", "task", "трекер", "tracker", "учёт", "учет", "инвентар", "inventory", "привычк", "habit", "база данных", "database", "таблиц", "table"],
  "integration-api": ["api", "интеграц", "integration", "webhook", "вебхук", "импорт", "import", "экспорт", "export", "синхрониз", "sync"],
  offline: ["офлайн", "оффлайн", "offline", "без интернета", "локально", "без сервера"],
}

/* Декоративные слова: они говорят о настроении, а не о работе. Заявка, состоящая ТОЛЬКО
   из них, — это просьба о картинке, и платформа обязана сказать об этом прямо, а не
   молча выбрать класс. Список пересекается с темами `detectTheme` намеренно: там это
   основание для решения, здесь — основание для предупреждения. */
const DECORATIVE_WORDS = [
  "фэнтези", "fantasy", "магия", "magic", "дракон", "dragon", "sci-fi", "scifi", "фантастик", "космос", "space",
  "киберпанк", "cyberpunk", "неон", "neon", "стимпанк", "steampunk", "постапокал", "хоррор", "horror", "мистик",
  "пират", "pirate", "супергеро", "superhero", "нуар", "noir", "вестерн", "western", "атлантид", "atlantis",
  "мифолог", "mythology", "красив", "beautiful", "стильн", "modern", "современн", "минимализм", "тёмн", "dark",
]

/**
 * Определяющие возможности класса и его подкрепляющие. Класс объявляется, только если
 * названа хотя бы одна ОПРЕДЕЛЯЮЩАЯ: иначе «магазин» вывелся бы из слова «поиск».
 */
const CLASS_RULES: Array<{ cls: ProductClass; defining: Capability[]; supporting: Capability[] }> = [
  { cls: "catalog-commerce", defining: ["catalog", "cart", "payments"], supporting: ["search", "auth", "roles-admin", "geo-map", "comments"] },
  { cls: "realtime-chat", defining: ["chat-realtime"], supporting: ["auth", "profiles", "notifications", "upload-media"] },
  { cls: "social-community", defining: ["profiles"], supporting: ["feed", "comments", "auth", "upload-media", "notifications"] },
  { cls: "content-feed", defining: ["feed"], supporting: ["comments", "search", "upload-media", "auth"] },
  { cls: "dashboard-analytics", defining: ["charts"], supporting: ["integration-api", "auth", "roles-admin", "search"] },
  { cls: "booking-schedule", defining: ["schedule"], supporting: ["auth", "payments", "notifications", "geo-map"] },
  { cls: "game-loop", defining: ["game-rules"], supporting: ["profiles", "auth", "notifications"] },
  { cls: "tracker-crud", defining: ["crud-records"], supporting: ["auth", "charts", "search", "notifications", "offline"] },
  { cls: "tool-utility", defining: ["integration-api", "upload-media"], supporting: ["search", "offline"] },
]

export type ProductClassMatch = {
  cls: ProductClass
  /** Возможности, НАЗВАННЫЕ человеком, по алфавиту — воспроизводимо между запусками. */
  capabilities: Capability[]
  /** Слова заявки, из которых выведен класс. Ответ обязан быть проверяемым человеком. */
  evidence: string[]
  /** Заявка состоит только из декоративных слов — просьба о виде, а не о функции. */
  decorativeOnly: boolean
  /** Сколько осмысленных слов в заявке: короткая заявка — отдельный риск, не класс. */
  words: number
}

/** Осмысленные слова: короткие склейки и знаки не считаем — «а», «и», «the» ничего не описывают. */
function meaningfulWords(text: string): number {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3).length
}

/**
 * Класс продукта по названию и заявке. Чистая функция: ни БД, ни сети, ни модели.
 *
 * Порядок решения:
 *   1) какие возможности НАЗВАНЫ (по словам, с сохранением найденных слов как улики);
 *   2) какой класс они определяют (нужна хотя бы одна определяющая возможность);
 *   3) при равном счёте — порядок `CLASS_RULES`: специфичный класс раньше общего,
 *      иначе «магазин с профилями» стал бы «сообществом» через более частое слово.
 *
 * Особый случай: возможностей нет вовсе. Тогда класс — `showcase-landing`, если названы
 * витринные слова («лендинг», «портфолио»), и `unknown` во всех остальных, включая
 * заявку из одних декоративных слов. Придумывать класс по настроению текста нельзя.
 */
export function classifyProduct(name: string, hint?: string | null): ProductClassMatch {
  const raw = `${name || ""} ${hint || ""}`
  const haystack = raw.toLowerCase()
  const words = meaningfulWords(raw)

  const capabilities: Capability[] = []
  const evidence: string[] = []

  for (const [cap, dictionary] of Object.entries(CAPABILITY_WORDS) as Array<[Capability, string[]]>) {
    const hits = dictionary.filter((w) => haystack.includes(w))
    if (hits.length > 0) {
      capabilities.push(cap)
      evidence.push(...hits)
    }
  }

  const showcaseWords = ["лендинг", "landing", "портфолио", "portfolio", "визитк", "витрин", "промо", "promo", "резюме", "cv"]
  const showcaseHits = showcaseWords.filter((w) => haystack.includes(w))

  const decorativeHits = DECORATIVE_WORDS.filter((w) => haystack.includes(w))
  /* Прямо названная витрина снимает упрёк «описан вид, а не работа»: человек попросил
     страницу осознанно, и предупреждать его о том, что он получит страницу, — придирка. */
  const decorativeOnly = capabilities.length === 0 && decorativeHits.length > 0 && showcaseHits.length === 0

  /* Возможности, которые бывают у ЛЮБОЙ страницы и потому не делают её системой.
     Без этого «портфолио с галереей» становилось «инструментом» через загрузку файлов. */
  const DRESSING: Capability[] = ["upload-media", "search"]

  const base: ProductClassMatch = {
    cls: "unknown",
    capabilities: [...capabilities].sort(),
    evidence: [...new Set(evidence)].sort(),
    decorativeOnly,
    words,
  }

  /* Витрина объявляется по ПРЯМЫМ словам («лендинг», «портфолио», «витрина») и только
     пока в заявке не названо ничего, кроме оформления: галерея и поиск на витрине —
     всё ещё витрина, а корзина или расписание — уже нет. */
  if (showcaseHits.length > 0 && capabilities.every((c) => DRESSING.includes(c))) {
    return { ...base, cls: "showcase-landing", evidence: [...new Set([...base.evidence, ...showcaseHits])].sort() }
  }

  if (capabilities.length === 0) return base

  const owned = new Set(capabilities)
  let best: { cls: ProductClass; score: number } | null = null

  for (const rule of CLASS_RULES) {
    const defining = rule.defining.filter((c) => owned.has(c)).length
    if (defining === 0) continue

    const supporting = rule.supporting.filter((c) => owned.has(c)).length
    /* Определяющая возможность весит больше подкрепляющей: класс задают деньги и корзина,
       а не поиск, который есть у всех. */
    const score = defining * 10 + supporting
    if (!best || score > best.score) best = { cls: rule.cls, score }
  }

  /* Возможности названы, но ни один класс их не определяет (например только «поиск»
     и «загрузка файлов» без предмета) — это по-прежнему «не знаю», и лучше сказать
     это, чем выбрать ближайший класс из вежливости. */
  return { ...base, cls: best?.cls ?? "unknown" }
}

/** Человеческое имя класса для витрины. Английский ключ остаётся в базе — витрине нужен русский. */
export const PRODUCT_CLASS_LABEL: Record<ProductClass, string> = {
  "catalog-commerce": "каталог с продажей",
  "content-feed": "лента материалов",
  "social-community": "сообщество с профилями",
  "realtime-chat": "живой обмен сообщениями",
  "dashboard-analytics": "панель с показателями",
  "booking-schedule": "запись и расписание",
  "tracker-crud": "учёт записей",
  "game-loop": "игровой цикл",
  "showcase-landing": "витрина-страница",
  "tool-utility": "инструмент",
  unknown: "класс не определён",
}
