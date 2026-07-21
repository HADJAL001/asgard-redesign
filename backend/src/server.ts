import express from "express"
import cors from "cors"
import morgan from "morgan"
import dotenv from "dotenv"
import helmet from "helmet"
import compression from "compression"

dotenv.config()

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

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"], // для Next.js
      imgSrc: ["'self'", "data:", "https:"],
      styleSrc: ["'self'", "'unsafe-inline'"],
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
app.use(compression({ level: 9, threshold: 1024 })) // сжимаем ответы > 1KB

/* Stripe webhook требует "сырое" (raw) тело запроса для проверки подписи,
   поэтому монтируем его ДО express.json(), с express.raw() именно для этого пути. */
import subscriptionRoutes from "./routes/subscription.routes"
app.use(
  "/subscription/webhook",
  express.raw({ type: "application/json" }),
)

app.use(express.json())


app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "osgard-backend", time: Date.now() })
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
import { runReferralMigration } from "./migrations/002_referral_system"
import { runPremiumUpgradeMigration } from "./migrations/003_premium_upgrade"
import { runSubscriptionsMigration } from "./migrations/004_subscriptions"
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
import walliRoutes from "./routes/walli.routes"
import demoRoutes from "./routes/demo.routes"
import adminRoutes from "./routes/admin.routes"



/* Гарантируем наличие колонок users.referral_code/referred_by/onboarding_step и таблицы referrals при старте сервера. */
runReferralMigration()

/* Гарантируем наличие колонки artifacts.visual_effect при старте сервера. */
runPremiumUpgradeMigration()

/* Гарантируем наличие таблицы subscriptions и колонки users.plan при старте сервера. */
runSubscriptionsMigration()

/* Гарантируем наличие таблицы tc_convert_log (лог конвертаций ∞ ↔ TC) при старте сервера. */
runTcConvertMigration()

/* Гарантируем наличие колонок twofa_secret и twofa_enabled при старте сервера. */
run2FAMigration()

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
app.use("/transactions", transactionsRoutes)
app.use("/onboarding", onboardingRoutes)
app.use("/referral", referralRoutes)
app.use("/subscription", subscriptionRoutes)
app.use("/jarvis", jarvisRoutes)
app.use("/jarvis", jarvisShopRoutes)
app.use("/twin", twinRoutes)
app.use("/feedback", feedbackRoutes)
app.use("/posts", communityRoutes)
app.use("/api/tc", tcRoutes)
app.use("/walli", walliRoutes)
app.use("/demo", demoRoutes)
app.use("/admin", adminRoutes)







app.use((req, res) => {
  res.status(404).json({ error: "Not found" })
})

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err)
  res.status(err.status || 500).json({ error: err.message || "Internal server error" })
})

app.listen(PORT, () => {
  console.log(`OSGARD backend listening on http://localhost:${PORT}`)
})
