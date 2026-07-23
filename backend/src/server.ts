import express from "express"
import cors from "cors"
import morgan from "morgan"
import dotenv from "dotenv"
import helmet from "helmet"
import compression from "compression"
import db from "./lib/db"
import { initSentry, captureError, Sentry } from "./lib/sentry"

dotenv.config()
initSentry()

/* Предупреждение о дефолтных секретах: JWT_SECRET/JWT_REFRESH_SECRET/ENCRYPTION_KEY
   имеют хардкод-фолбэки в auth.ts/encryption.ts (чтобы сервер не падал при старте),
   но на проде с фолбэком токены/шифрование становятся тривиально подделываемыми
   или расшифровываемыми. Сам фолбэк не меняем — на Railway уже могут лежать данные,
   зашифрованные/подписанные им, и смена ключа без миграции их сломает. Просто громко
   предупреждаем в логах, чтобы это было видно при деплое. */
;(function warnOnDefaultSecrets() {
  const missing: string[] = []
  if (!process.env.JWT_SECRET) missing.push("JWT_SECRET")
  if (!process.env.JWT_REFRESH_SECRET) missing.push("JWT_REFRESH_SECRET")
  if (!process.env.ENCRYPTION_KEY) missing.push("ENCRYPTION_KEY")
  if (missing.length === 0) return

  if (process.env.NODE_ENV === "production") {
    console.error(
      `[fatal] Не заданы обязательные переменные окружения: ${missing.join(", ")} — ` +
        `в production сервер не может безопасно стартовать с дефолтными секретами из кода ` +
        `(токены/шифрование были бы тривиально подделываемы). Задайте их в Railway → Variables.`,
    )
    process.exit(1)
  }

  console.warn(
    `[security] Не заданы переменные окружения: ${missing.join(", ")} — используются небезопасные дефолты из кода. ` +
      `Задайте их в окружении (Railway → Variables), особенно в production.`,
  )
})()

/* Защитная сетка поверх asyncHandler на роутах: если где-то всё же проскочит
   необработанный reject/throw (в т.ч. вне HTTP-запроса — например, в фоновом
   fire-and-forget джобе), по умолчанию Node (>=15) убивает ВЕСЬ процесс.
   Логируем и продолжаем работу — краш одного запроса не должен ронять всех
   остальных пользователей. */
process.on("unhandledRejection", (reason) => {
  captureError("[unhandledRejection]", reason)
})
process.on("uncaughtException", (err) => {
  captureError("[uncaughtException]", err)
})

const app = express()
const PORT = process.env.PORT || 3002

// Разрешённые origin: из env или по умолчанию localhost + vercel
const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map(o => o.trim())
  .filter(Boolean)

if (!ALLOWED_ORIGINS.includes("http://localhost:3000")) {
  ALLOWED_ORIGINS.push("http://localhost:3000")
}
if (!ALLOWED_ORIGINS.includes("http://localhost:3001")) {
  ALLOWED_ORIGINS.push("http://localhost:3001")
}
if (!ALLOWED_ORIGINS.includes("https://osgardnewworld.com")) {
  ALLOWED_ORIGINS.push("https://osgardnewworld.com")
}
if (!ALLOWED_ORIGINS.includes("https://www.osgardnewworld.com")) {
  ALLOWED_ORIGINS.push("https://www.osgardnewworld.com")
}

/* Этот сервер отдаёт только JSON (нет res.render/sendFile/express.static) —
   инлайн-скрипты/стили здесь никогда не рендерятся, поэтому 'unsafe-inline'
   не нужен даже для форм-совместимости. CSP браузерного фронтенда (Next.js)
   настраивается отдельно, в его собственном middleware. */
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      styleSrc: ["'self'"],
      connectSrc: ["'self'", "https://api.mainnet-beta.solana.com"]
    }
  }
}))

app.use(cors({
  origin: (origin, callback) => {
    // разрешаем запросы без origin (мобильные, curl, postman)
    if (!origin) return callback(null, true)
    // разрешаем vercel.app и заданные origins
    if (
      ALLOWED_ORIGINS.includes(origin) ||
      /\.vercel\.app$/.test(origin) ||
      /\.railway\.app$/.test(origin)
    ) {
      return callback(null, true)
    }
    callback(new Error(`CORS blocked: ${origin}`))
  },
  credentials: true
}))
app.use(morgan("dev"))
app.use(compression({ level: 6, threshold: 1024 })) // сжимаем ответы > 1KB

/* Stripe webhook требует "сырое" (raw) тело запроса для проверки подписи,
   поэтому монтируем его ДО express.json(), с express.raw() именно для этого пути. */
import subscriptionRoutes from "./routes/subscription.routes"
app.use(
  "/subscription/webhook",
  express.raw({ type: "application/json" }),
)

/* Аналогично — отдельный Stripe webhook для addon-подписок ДЖАРВИС/ВАЛЛИ Premium. */
import addonsRoutes from "./routes/addons.routes"
import customizationRoutes from "./routes/customization.routes"
import coursesRoutes from "./routes/courses.routes"
app.use(
  "/addons/webhook",
  express.raw({ type: "application/json" }),
)

/* Публичный inbound Webhook Trigger оркестратора (Phase 2 Service Bridge) —
   тело тоже нужно как Buffer, т.к. внешние сервисы не всегда шлют корректный
   application/json, а раут парсит JSON вручную с fallback на сырую строку. */
import webhookTriggerPublicRoutes from "./routes/webhook-trigger-public.routes"
app.use(
  "/wh",
  express.raw({ type: "application/json" }),
)

app.use(express.json())

import { writeBackpressure, getWriteQueueStats } from "./middleware/write-backpressure"
app.use(writeBackpressure)

app.get("/health", (_req, res) => {
  const dbStart = Date.now()
  let dbOk = true
  try {
    db.prepare("SELECT 1").get()
  } catch {
    dbOk = false
  }
  res.json({
    ok: true,
    service: "osgard-backend",
    time: Date.now(),
    db: { ok: dbOk, latencyMs: Date.now() - dbStart },
    sse: { activeConnections: getActiveSseConnections(), activeGenerationConnections: getGenerationSseConnections() },
    writeQueue: getWriteQueueStats(),
  })
})

/* Routes are mounted after they're implemented in later stages */
import authRoutes from "./routes/auth.routes"
import oauthRoutes from "./routes/oauth.routes"
import walletRoutes from "./routes/wallet.routes"
import tcMarketRoutes from "./routes/tcmarket.routes"
import stakesRoutes from "./routes/stakes.routes"
import artifactsRoutes from "./routes/artifacts.routes"
import marketplaceRoutes from "./routes/marketplace.routes"
import projectsRoutes from "./routes/projects.routes"
import leaderboardRoutes from "./routes/leaderboard.routes"
import hallOfFameRoutes from "./routes/halloffame.routes"
import transactionsRoutes from "./routes/transactions.routes"
import onboardingRoutes from "./routes/onboarding.routes"
import referralRoutes from "./routes/referral.routes"
import jarvisRoutes from "./routes/jarvis.routes"
import jarvisShopRoutes from "./routes/jarvis-shop.routes"
import twinRoutes from "./routes/twin.routes"
import feedbackRoutes from "./routes/feedback.routes"
import communityRoutes from "./routes/community.routes"
import tcRoutes from "./routes/tc.routes"
import notificationsRoutes from "./routes/notifications.routes"
import usersRoutes from "./routes/users.routes"
import pushRoutes from "./routes/push.routes"
import feedRoutes from "./routes/feed.routes"
import { runOrderBookMigration } from "./migrations/001_order_book"
import { runReferralMigration } from "./migrations/002_referral_system"
import { runPremiumUpgradeMigration } from "./migrations/003_premium_upgrade"
import { runSubscriptionsMigration } from "./migrations/004_subscriptions"
import { runTrialMigration } from "./migrations/042_trial"
import { runPromoCodesMigration } from "./migrations/043_promo_codes"
import "./migrations/005_digital_twin"
import "./migrations/006_jarvis_shop"
import "./migrations/007_feedback"
import { runTcConvertMigration } from "./migrations/008_tc_convert"
import { run2FAMigration } from "./migrations/009_2fa"
import { runNonceMigration } from "./migrations/010_nonce"
import { runIndexesMigration } from "./migrations/011_indexes"
import { runWalliSystemMigration } from "./migrations/012_walli_system"
import { runWalliStatsMigration } from "./migrations/013_walli_stats"
import { runAdminMigration } from "./migrations/014_admin"
import { runSocialLoginMigration } from "./migrations/015_social_login"
import { runRelaxRequiredFieldsMigration } from "./migrations/016_relax_required_fields"
import "./migrations/017_community"
import "./migrations/018_ensure_wallets"
import "./migrations/019_ensure_transactions_columns"
import "./migrations/020_ensure_artifacts_schema"
import "./migrations/021_post_likes"
import "./migrations/022_admin_logs"
import "./migrations/023_core_economy_tables"
import "./migrations/024_ensure_projects_schema"
import "./migrations/025_ai_artifacts"
import "./migrations/026_twin_ai"
import "./migrations/027_project_files"
import "./migrations/028_github_publish"
import "./migrations/029_netlify_deploy"
import "./migrations/030_project_templates"
import "./migrations/031_jarvis_personality"
import "./migrations/032_ensure_withdrawals"
import "./migrations/033_kyc_fields"
import "./migrations/034_orchestrator_chains"
import "./migrations/035_demo_bonus_claimed"
import "./migrations/036_stripe_events"
import "./migrations/037_transactions_composite_index"
import "./migrations/038_audit_log"
import "./migrations/039_walli_items_index"
import "./migrations/040_orchestrator_jarvis_templates"
import walliRoutes from "./routes/walli.routes"
import demoRoutes from "./routes/demo.routes"
import adminRoutes from "./routes/admin.routes"
import promoRoutes from "./routes/promo.routes"
import orchestratorRoutes, { getActiveSseConnections } from "./routes/orchestrator.routes"
import generateProjectRoutes, { getGenerationSseConnections } from "./routes/generate-project.routes"
import webhooksRoutes from "./routes/webhooks.routes"
import serviceBridgeRoutes from "./routes/service-bridge.routes"
import { runGenerationTasksMigration } from "./migrations/044_generation_tasks"
import { runGenerationMetricsMigration } from "./migrations/045_generation_metrics"
import { runWebhooksMigration } from "./migrations/046_webhooks"
import { runAgentExecutionsMigration } from "./migrations/047_agent_executions"
import { runCacheMetricsMigration } from "./migrations/048_cache_metrics"
import { runServiceBridgeMigration } from "./migrations/049_service_bridge"
import { runPlanTiersMigration } from "./migrations/050_plan_tiers"
import { runPerfIndexesMigration } from "./migrations/051_perf_indexes"
import { runAddonSubscriptionsMigration } from "./migrations/055_addon_subscriptions"
import { runAddonProgressionMigration } from "./migrations/056_addon_progression"
import { runAddonCustomizationMigration } from "./migrations/057_addon_customization"
import { runAddonCoursesMigration } from "./migrations/058_addon_courses"
import { runSeedCoursesMigration } from "./migrations/059_seed_courses"
import "./migrations/060_tc_price_history_index"
import { runOrchestratorWebhookTriggersMigration } from "./migrations/061_orchestrator_webhook_triggers"
import { runReferralsTableMigration } from "./migrations/062_referrals_table"
import { runNotificationsMigration } from "./migrations/063_notifications_table"
import { runPushTokensMigration } from "./migrations/064_push_tokens"
import { runActivityFeedMigration } from "./migrations/065_activity_feed_table"
/* Импорт только ради побочного эффекта: запускает module-level setInterval периодической
   очистки старых generation_tasks (см. сам файл — тот же стиль, что и middleware/rateLimiter.ts). */
import "./services/cleanup.service"



/* Гарантируем наличие tc_orders и недостающих колонок tc_trades при старте сервера
   (раньше выполнялось только вручную/через init-db.ts на новых базах — на существующих
   базах, созданных до появления order book, таблица могла отсутствовать). */
runOrderBookMigration()

/* Гарантируем наличие колонок users.referral_code/referred_by/onboarding_step при старте сервера. */
runReferralMigration()

/* Гарантируем наличие таблицы referrals (журнал начислений по рефералке) при старте сервера —
   раньше создавалась только вручную/устаревшей удалённой миграцией, на свежей БД отсутствовала. */
runReferralsTableMigration()

/* Гарантируем наличие колонки artifacts.visual_effect при старте сервера. */
runPremiumUpgradeMigration()

/* Гарантируем наличие таблицы subscriptions и колонки users.plan при старте сервера. */
runSubscriptionsMigration()
runTrialMigration()
runPromoCodesMigration()
runGenerationTasksMigration()
runGenerationMetricsMigration()
runWebhooksMigration()
runAgentExecutionsMigration()
runCacheMetricsMigration()

/* Индексы под горячие пути (artifacts.owner_id, tc_trades(ts,id), marketplace_listings(status,listed_at)).
   Вызывается явно здесь, а не самовызовом при импорте — tc_trades создаётся только внутри
   runOrderBookMigration() выше, и на свежей БД самовызов при импорте упал бы раньше её создания. */
runPerfIndexesMigration()

/* Гарантируем наличие таблиц integrations/integration_logs (Service Bridge / Интеграции). */
runServiceBridgeMigration()

/* Ремап planKey (architect/master/legend → free/pro/supreme/duo/elite) + таблицы квот
   оркестратора по провайдерам (orchestrator_monthly_usage) и докупаемых пакетов (extra_credits,
   extra_package_purchases) при старте сервера. */
runPlanTiersMigration()

/* Гарантируем наличие таблицы tc_convert_log (лог конвертаций ∞ ↔ TC) при старте сервера. */
runTcConvertMigration()

/* Гарантируем наличие колонок twofa_secret и twofa_enabled при старте сервера. */
run2FAMigration()

/* Гарантируем наличие таблицы notifications (лайки/комментарии к постам) при старте сервера. */
runNotificationsMigration()

/* Гарантируем наличие таблицы push_tokens (Expo push-токены мобильного приложения) при старте сервера. */
runPushTokensMigration()

/* Гарантируем наличие таблицы activity_events (публичная глобальная лента активности) при старте сервера. */
runActivityFeedMigration()

/* Гарантируем наличие колонки nonce в таблице users при старте сервера. */
runNonceMigration()

/* Гарантируем наличие performance-индексов при старте сервера. */
runIndexesMigration()

/* Гарантируем наличие таблиц системы прокачки ВАЛЛИ. */
runWalliSystemMigration()

/* Гарантируем наличие таблицы walli_stats (игровая статистика). */
runWalliStatsMigration()

/* Гарантируем наличие колонки users.banned и роли admin у аккаунта разработчика. */
runAdminMigration()

/* Гарантируем наличие колонок для соцвходов (google/github), phone, ip_address, is_linked, last_login. */
runSocialLoginMigration()

/* Ослабляем NOT NULL на users.email/password_hash — нужно для чисто соц-аккаунтов без пароля/email. */
runRelaxRequiredFieldsMigration()

/* Гарантируем наличие таблицы addon_subscriptions (параллельные подписки ДЖАРВИС/ВАЛЛИ Premium) при старте сервера. */
runAddonSubscriptionsMigration()

/* Гарантируем наличие таблиц addon_xp_events/addon_progress/addon_achievements (прогрессия по активности). */
runAddonProgressionMigration()

/* Гарантируем наличие таблиц addon_customizations/addon_customization_unlocks (кастомные преображения). */
runAddonCustomizationMigration()

/* Гарантируем наличие таблиц courses/course_progress (обучение по продуктам ДЖАРВИС/ВАЛЛИ Premium). */
runAddonCoursesMigration()

/* Наполняем каталог courses стартовым набором модулей, если он ещё пуст. */
runSeedCoursesMigration()

/* Гарантируем наличие таблицы orchestrator_webhook_triggers (Phase 2: входящий Webhook Trigger). */
runOrchestratorWebhookTriggersMigration()

/* Самолечение: если процесс перезапустился во время генерации приложения (in-memory
   состояние джоба теряется), зависшие в "generating" проекты переводим в "failed" —
   иначе они зависли бы навсегда. */
db.prepare(`UPDATE projects SET status = 'failed', generation_error = 'Генерация прервана перезапуском сервера' WHERE status = 'generating'`).run()

/* Аналогичное самолечение для зависших деплоев на Netlify. */
db.prepare(`UPDATE projects SET deploy_status = 'failed', deploy_error = 'Деплой прерван перезапуском сервера' WHERE deploy_status = 'deploying'`).run()

/* Аналогичное самолечение для зависших задач генерации проекта через ChainManager
   (services/chain-manager.ts) — состояние семафора/выполнения теряется при рестарте. */
db.prepare(`UPDATE generation_tasks SET status = 'failed', error = 'Генерация прервана перезапуском сервера' WHERE status IN ('queued', 'processing')`).run()




app.use("/auth", authRoutes)
app.use("/auth", oauthRoutes)
app.use("/wallet", walletRoutes)
app.use("/tc-market", tcMarketRoutes)
app.use("/stakes", stakesRoutes)
app.use("/artifacts", artifactsRoutes)
app.use("/marketplace", marketplaceRoutes)
app.use("/projects", projectsRoutes)
app.use("/leaderboard", leaderboardRoutes)
app.use("/hall-of-fame", hallOfFameRoutes)
app.use("/notifications", notificationsRoutes)
app.use("/feed", feedRoutes)
app.use("/users", usersRoutes)
app.use("/push", pushRoutes)
app.use("/transactions", transactionsRoutes)
app.use("/onboarding", onboardingRoutes)
app.use("/referral", referralRoutes)
app.use("/subscription", subscriptionRoutes)
app.use("/addons", addonsRoutes)
app.use("/addons/customization", customizationRoutes)
app.use("/addons/courses", coursesRoutes)
app.use("/jarvis", jarvisRoutes)
app.use("/jarvis", jarvisShopRoutes)
app.use("/twin", twinRoutes)
app.use("/feedback", feedbackRoutes)
app.use("/posts", communityRoutes)
app.use("/api/tc", tcRoutes)
app.use("/walli", walliRoutes)
app.use("/demo", demoRoutes)
app.use("/admin", adminRoutes)
app.use("/orchestrator", orchestratorRoutes)
app.use("/promo", promoRoutes)
app.use("/", generateProjectRoutes)
app.use("/webhooks", webhooksRoutes)
app.use("/integrations", serviceBridgeRoutes)
app.use("/wh", webhookTriggerPublicRoutes)







app.use((req, res) => {
  res.status(404).json({ error: "Not found" })
})

/* Ловит все ошибки, дошедшие сюда через next(err) (в т.ч. из asyncHandler на роутах),
   и отправляет их в Sentry перед финальным JSON-ответом клиенту. */
Sentry.setupExpressErrorHandler(app)

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  captureError("[express error handler]", err)

  /* SQLite FK-constraint нарушения (например INSERT в user_twins с user_id, которого больше
     нет в users — протухший JWT после пересоздания БД) не должны отдавать клиенту сырой текст
     драйвера. Трактуем как невалидную сессию — фронтенд (auth-store) уже умеет разлогинивать
     по 401.
     Бэкенд использует встроенный node:sqlite (DatabaseSync, см. lib/db.ts), а не better-sqlite3 —
     его ошибки приходят с code="ERR_SQLITE_ERROR" и numeric errcode (extended result code;
     787 = SQLITE_CONSTRAINT_FOREIGNKEY и т.д.), а не строками вида "SQLITE_CONSTRAINT_*".
     Primary result code SQLITE_CONSTRAINT = 19; extended codes упаковывают его в младший байт. */
  const isDbConstraintError =
    err?.code === "ERR_SQLITE_ERROR" &&
    (typeof err.errcode === "number" ? (err.errcode & 0xff) === 19 : /constraint failed/i.test(err?.message || ""))
  if (isDbConstraintError) {
    res.status(401).json({ error: "Сессия недействительна. Пожалуйста, войдите заново." })
    return
  }

  res.status(err.status || 500).json({ error: err.message || "Internal server error" })
})

const server = app.listen(PORT, () => {
  console.log(`OSGARD backend listening on http://localhost:${PORT}`)
})

/* Ошибка бинда порта (например EADDRINUSE при параллельном запуске второго
   процесса) — фатальна для этого экземпляра: если её просто залогировать и
   продолжить (как unhandledRejection/uncaughtException выше), процесс
   остаётся висеть в памяти с уже поднятым DB-пулом и фоновыми setInterval
   (rate-limiter, OAuth state store), но никогда не принимает запросы —
   осиротевший "зомби"-процесс. Явно завершаем его, чтобы такие процессы
   не накапливались. */
server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(`[fatal] Порт ${PORT} уже занят другим процессом — завершаю работу вместо накопления зависшего процесса.`)
    process.exit(1)
  }
  throw err
})
