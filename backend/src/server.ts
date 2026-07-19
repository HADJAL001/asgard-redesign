import express from "express"
import cors from "cors"
import morgan from "morgan"
import dotenv from "dotenv"
import helmet from "helmet"
import compression from "compression"

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3002
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:3000"

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

app.use(cors({ origin: CORS_ORIGIN, credentials: true }))
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
import tcRoutes from "./routes/tc.routes"
import { runPremiumUpgradeMigration } from "./migrations/003_premium_upgrade"
import { runSubscriptionsMigration } from "./migrations/004_subscriptions"
import "./migrations/005_digital_twin"
import "./migrations/006_jarvis_shop"
import "./migrations/007_feedback"
import { runTcConvertMigration } from "./migrations/008_tc_convert"
import { run2FAMigration } from "./migrations/009_2fa"
import { runNonceMigration } from "./migrations/010_nonce"
import { runIndexesMigration } from "./migrations/011_indexes"



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




app.use("/auth", authRoutes)
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
app.use("/api/tc", tcRoutes)







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
