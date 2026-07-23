"use client"

/* ================================================================
   OSGARD · Zustand store — ШАГ 5 (ФИНАЛЬНЫЙ) + ШАГ 6 (priceHistory)
   ----------------------------------------------------------------
   Добавлены методы для работы с заявками (orders) (ШАГ 2):
     fetchUserOrders()  → GET    /tc-market/orders
     createLimitOrder() → POST   /tc-market/order
     cancelOrder()      → DELETE /tc-market/order/:id

   Добавлены market-ордера (ШАГ 3):
     createMarketBuy()  → POST /tc-market/buy   { usdAmount }
     createMarketSell() → POST /tc-market/sell  { tcAmount }

   Добавлены стейкинг и конвертация валют (ШАГ 4):
     fetchStakes()      → GET  /stakes
     stakeTC()          → POST /stakes                { amount, days }
     unstakeTC()        → POST /stakes/:id/unstake
     convertCurrency()  → POST /wallet/convert         { fromCurrency, toCurrency, amount }

   Добавлены хелперы (ШАГ 5 — финальный):
     refreshAll()    → последовательно вызывает все fetch-функции стора,
                       ошибки одного запроса не прерывают остальные
     reset()         → сбрасывает состояние стора в начальные значения
     spendCredits()  → локально списывает credits из кошелька (для UI, без API)
     addCredits()    → локально начисляет credits в кошелёк (для UI, без API)

   ШАГ 6: добавлено поле priceHistory (PricePoint[]) — заполняется из
   GET /tc-market/state (поле history), используется в tc-market-panel.tsx
   для построения свечного графика через candlesFor() из lib/tc-market.ts.

   Поддерживаемые валюты: credits, shards, crystals, timecoin, cash_usd.

   Источник данных — бэкенд (tcmarket.routes.ts, stakes.routes.ts, wallet.routes.ts):
     GET /wallet
     GET /tc-market/state
     GET /tc-market/orderbook
     GET /tc-market/trades
     GET /tc-market/orders
     POST /tc-market/order
     DELETE /tc-market/order/:id
     POST /tc-market/buy
     POST /tc-market/sell
     GET /stakes
     POST /stakes
     POST /stakes/:id/unstake
     POST /wallet/convert
   ================================================================ */



import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from "react"
import { create } from "zustand"
import { useAuth } from "@/lib/auth-store"
import { apiClient, ApiError } from "@/lib/api-client"
import { CURRENCIES, convertQuote, toCredits, type CurrencyId, type Wallet } from "@/lib/economy"
import {
  DAY_MS,
  STAKE_TERMS,
  pctChange,
  type OrderBook,
  type OrderRow,
  type PricePoint,
  type Stake,
  type TCTrade,
  type TCTransaction,
  type TxKind,
} from "@/lib/tc-market"

/* ================================================================
   Типы
   ================================================================ */

/** Кошелёк пользователя (см. таблицу wallets в бэкенде). */
export interface OsgardWallet {
  cash_usd: number
  timecoin: number
  credits: number
  shards: number
  crystals: number
}

/** Состояние рынка TimeCoin (см. GET /tc-market/state). */
export interface TcPriceState {
  price: number
  minted: number
  burned: number
  staked: number
  circulating: number
}

/** Одна строка стакана заявок (агрегированный уровень цены). */
export interface OrderBookLevel {
  price: number
  amount: number
}

/** Стакан заявок (см. GET /tc-market/orderbook). */
export interface OrderBookState {
  bids: OrderBookLevel[]
  asks: OrderBookLevel[]
  spread: number
  mid: number
}

/** Сделка на рынке TimeCoin (см. GET /tc-market/trades). */
export interface TcTrade {
  id: number
  ts: number
  price: number
  amount: number
  side: "buy" | "sell"
  origin?: string
}

/** Заявка пользователя (см. GET /tc-market/orders). */
export interface UserOrder {
  id: number
  side: "buy" | "sell"
  price: number
  amount: number
  filledAmount: number
  status: string
  createdAt: number
  updatedAt: number
}

/** Стейк пользователя (см. stakes.routes.ts). */
export interface OsgardStake {
  id: number | string
  amountTC: number
  days: number
  apr: number
  startTs: number
  endTs: number
  status: "active" | "closed"
}

/** Артефакт пользователя (см. artifacts.routes.ts). */
export interface OsgardArtifact {
  id: number
  projectId: number | null
  name: string
  type: string
  rarity: string
  level: number
  power: number
  defense: number
  magic: number
  speed: number
  status: "kept" | "listed" | "sold"
  views24h: number
  supply: number
  price: number
  listCurrency: string
  /** Уникальный визуальный эффект (появляется при level >= 10 через премиум-усиление). */
  visualEffect?: string | null
  /** Поля AI-генерации (POST /artifacts/generate-ai) — null/undefined для вручную скованных артефактов. */
  description?: string | null
  lore?: string | null
  aiVisual?: string | null
  source?: string | null
  createdAt: number
}

/** Запись рейтинга архитекторов (см. GET /leaderboard). */
export interface LeaderboardEntry {
  userId: number
  username: string
  displayName: string | null
  avatarUrl: string | null
  level: number
  totalIncome: number
  totalSales: number
  artifactCount: number
}

/** Транзакция пользователя (см. GET /transactions). */
export interface OsgardTransaction {
  id: number
  type: string
  item: string | null
  counterparty: string | null
  amount: number
  currency: string
  status: string
  createdAt: number
}


/** Лот маркетплейса (см. GET /marketplace/listings). */
export interface MarketListing {

  id: number
  artifactId: number
  sellerId: number
  price: number
  currency: string
  status: "active" | "sold" | "cancelled"
  listedAt: number
  artifactName: string
  artifactType: string
  rarity: string
  level: number
  power: number
  defense: number
  magic: number
  speed: number
  sellerUsername: string
  sellerDisplayName: string | null
}



/** Результат createLimitOrder/cancelOrder — унифицированный ответ для UI. */
export interface OrderActionResult {
  success: boolean
  error?: string
}

/** Результат market-сделки (см. POST /tc-market/buy и /tc-market/sell). */
export interface MarketTradeInfo {
  side: "buy" | "sell"
  price: number
  tcAmount: number
  usdAmount: number
  newPrice: number
  orderbookAmount: number
  emissionAmount?: number
  burnAmount?: number
}

/** Результат createMarketBuy/createMarketSell — унифицированный ответ для UI. */
export interface MarketActionResult {
  success: boolean
  trade?: MarketTradeInfo
  error?: string
}

/** Поддерживаемые валюты кошелька (см. wallet.routes.ts). */
export type CurrencyKey = "credits" | "shards" | "crystals" | "timecoin" | "cash_usd"

/** Результат stakeTC/unstakeTC — унифицированный ответ для UI. */
export interface StakeActionResult {
  success: boolean
  stake?: OsgardStake
  reward?: number
  totalReturn?: number
  matured?: boolean
  error?: string
}

/** Результат convertCurrency — унифицированный ответ для UI. */
export interface ConvertActionResult {
  success: boolean
  conversion?: {
    from: CurrencyKey
    to: CurrencyKey
    amountSent: number
    amountReceived: number
    fee: number
  }
  error?: string
}

/** Результат lookupRecipient — предпросмотр получателя перед переводом TC. */
export interface RecipientLookupResult {
  found: boolean
  displayName?: string
  error?: string
}

/** Результат transferTC — унифицированный ответ для UI. */
export interface TransferActionResult {
  success: boolean
  transfer?: {
    recipientEmail: string
    recipientName: string
    amount: number
    comment: string
  }
  error?: string
}

/** Результат forgeArtifact — унифицированный ответ для UI. */
export interface ForgeActionResult {
  success: boolean
  artifact?: OsgardArtifact
  error?: string
}

/** Результат generateAiArtifact (см. POST /artifacts/generate-ai) — унифицированный ответ для UI. */
export interface AiArtifactActionResult {
  success: boolean
  artifact?: OsgardArtifact
  aiSource?: "grok" | "deepseek" | "fallback"
  error?: string
}

/** Результат premiumUpgradeArtifact (см. POST /artifacts/:id/premium-upgrade) — унифицированный ответ для UI. */
export interface PremiumUpgradeActionResult {
  success: boolean
  artifact?: OsgardArtifact
  /** true, если сработал шанс критического усиления (+2 уровня вместо +1). */
  critical?: boolean
  /** Фактический прирост уровня (1 или 2 при крите). */
  levelGain?: number
  /** Стоимость в TimeCoin, списанная за это усиление. */
  cost?: number
  error?: string
}

/** Проект пользователя (см. backend/src/routes/projects.routes.ts). */
export interface OsgardProject {
  id: number
  name: string
  description: string
  badge: string
  artifactCount: number
  sold: number
  income: number
  /** Статус генерации реального приложения: generating → ready | failed. */
  status: "generating" | "ready" | "failed"
  /** Сообщение об ошибке генерации (или синтаксические ошибки валидации сгенерированных файлов). */
  generationError?: string | null
  /** Источник генерации файлов приложения: "ai"/"template-ai" (сгенерировано провайдером,
      напрямую или через сохранённый шаблон) или "fallback"/"template-local" (без AI). */
  aiSource?: "ai" | "fallback" | "template-ai" | "template-local" | null
  /** Статус деплоя на Netlify (независим от status — проект можно передеплоить много раз). */
  deployStatus?: "deploying" | "deployed" | "failed" | null
  deployError?: string | null
  liveUrl?: string | null
  createdAt: number
}

/** Один файл сгенерированного приложения (см. GET /projects/:id/files). */
export interface OsgardProjectFile {
  path: string
  content: string
  updatedAt: number
}

/** Результат createProject/generateProject/updateProject — унифицированный ответ для UI. */
export interface ProjectActionResult {
  success: boolean
  project?: OsgardProject
  artifacts?: OsgardArtifact[]
  aiConfigured?: boolean
  error?: string
}

/** Результат publishProjectToGithub (см. POST /projects/:id/publish-github). */
export interface GithubPublishActionResult {
  success: boolean
  repoUrl?: string
  commitSha?: string
  error?: string
}

/** Результат saveProjectFile (см. PUT /projects/:id/files/*). */
export interface SaveFileActionResult {
  success: boolean
  errors?: string[]
  error?: string
}

/** Результат deployProjectToNetlify (см. POST /projects/:id/deploy-netlify). */
export interface NetlifyDeployActionResult {
  success: boolean
  project?: OsgardProject
  error?: string
}





/* ================================================================
   State + actions
   ================================================================ */

export interface OsgardStoreState {
  /* ---- данные ---- */
  wallet: OsgardWallet
  tcPrice: TcPriceState
  /** История цены TimeCoin (см. GET /tc-market/state → поле history). Используется для графика/свечей. */
  priceHistory: PricePoint[]
  orderBook: OrderBookState
  trades: TcTrade[]
  userOrders: UserOrder[]
  stakes: OsgardStake[]
  artifacts: OsgardArtifact[]
  marketplaceListings: MarketListing[]
  /** Рейтинг архитекторов (см. GET /leaderboard). Доход, кол-во продаж, уровень. */
  leaderboard: LeaderboardEntry[]
  /** История транзакций пользователя (см. GET /transactions). */
  transactions: OsgardTransaction[]
  /** Проекты текущего пользователя (см. GET /projects/mine). */
  projects: OsgardProject[]
  /** Артефакты открытого проекта + сам проект (см. GET /projects/:id). */
  currentProject: OsgardProject | null
  currentProjectArtifacts: OsgardArtifact[]
  /** Файлы сгенерированного приложения открытого проекта (см. GET /projects/:id/files). */
  currentProjectFiles: OsgardProjectFile[]

  /* ---- служебное состояние ---- */





  loading: boolean
  error: string | null

  /* ---- fetch-функции ---- */
  fetchWallet: (opts?: { skipAuthRedirect?: boolean }) => Promise<void>
  fetchTcState: (opts?: { skipAuthRedirect?: boolean }) => Promise<void>
  fetchOrderBook: (opts?: { skipAuthRedirect?: boolean }) => Promise<void>
  fetchTrades: (opts?: { skipAuthRedirect?: boolean }) => Promise<void>

  /* ---- работа с заявками (ШАГ 2) ---- */
  /** GET /tc-market/orders — заявки текущего пользователя. */
  fetchUserOrders: (opts?: { skipAuthRedirect?: boolean }) => Promise<void>
  /** POST /tc-market/order — разместить лимитную заявку. */
  createLimitOrder: (
    side: "buy" | "sell",
    price: number,
    amount: number,
  ) => Promise<OrderActionResult>
  /** DELETE /tc-market/order/:id — отменить заявку. */
  cancelOrder: (orderId: number) => Promise<OrderActionResult>

  /* ---- market-ордера (ШАГ 3) ---- */
  /** POST /tc-market/buy — купить TimeCoin на сумму usdAmount (в cash_usd). */
  createMarketBuy: (usdAmount: number) => Promise<MarketActionResult>
  /** POST /tc-market/sell — продать tcAmount TimeCoin. */
  createMarketSell: (tcAmount: number) => Promise<MarketActionResult>

  /* ---- стейкинг и конвертация (ШАГ 4) ---- */
  /** GET /stakes — стейки текущего пользователя. */
  fetchStakes: (opts?: { skipAuthRedirect?: boolean }) => Promise<void>
  /** POST /stakes — открыть стейк TimeCoin на amount на срок days. */
  stakeTC: (amount: number, days: number) => Promise<StakeActionResult>
  /** POST /stakes/:id/unstake — закрыть стейк. */
  unstakeTC: (stakeId: number | string) => Promise<StakeActionResult>
  /** POST /wallet/convert — конвертировать amount валюты from в валюту to. */
  convertCurrency: (
    from: CurrencyKey,
    to: CurrencyKey,
    amount: number,
  ) => Promise<ConvertActionResult>
  /** GET /wallet/lookup-recipient — найти получателя перевода TC по email (для live-предпросмотра в форме). */
  lookupRecipient: (email: string) => Promise<RecipientLookupResult>
  /** POST /wallet/transfer — перевести amount TC другому пользователю (email + комментарий + пароль/2FA). */
  transferTC: (
    recipientEmail: string,
    amount: number,
    comment: string,
    password: string,
    twofaToken?: string,
  ) => Promise<TransferActionResult>

  /* ---- кузница артефактов ---- */
  /** GET /artifacts/mine — артефакты текущего пользователя. */
  fetchArtifacts: (opts?: { skipAuthRedirect?: boolean }) => Promise<void>

  /** POST /artifacts/forge — создать новый артефакт (name, type, опционально привязать к projectId). */
  forgeArtifact: (name: string, type: string, projectId?: number) => Promise<ForgeActionResult>

  /** POST /artifacts/generate-ai — AI-генерация уникального артефакта (Grok → DeepSeek → fallback). */
  generateAiArtifact: (hint?: string) => Promise<AiArtifactActionResult>

  /** POST /artifacts/:id/premium-upgrade — премиум-усиление артефакта за TimeCoin (мгновенно, до уровня 10, 25% шанс крита). */
  premiumUpgradeArtifact: (artifactId: number) => Promise<PremiumUpgradeActionResult>

  /* ---- маркетплейс ---- */
  /** GET /marketplace/listings — список всех активных лотов на продаже. */
  fetchListings: (opts?: { skipAuthRedirect?: boolean }) => Promise<void>
  /** POST /marketplace/:id/buy — купить лот по id. */
  buyListing: (listingId: number) => Promise<ForgeActionResult>

  /* ---- рейтинг архитекторов ---- */
  /** GET /leaderboard — рейтинг пользователей по доходу/продажам/уровню. */
  fetchLeaderboard: (opts?: { skipAuthRedirect?: boolean }) => Promise<void>

  /* ---- история транзакций ---- */
  /** GET /transactions — история транзакций текущего пользователя. */
  fetchTransactions: (opts?: { skipAuthRedirect?: boolean }) => Promise<void>

  /* ---- проекты ---- */
  /** GET /projects/mine — список проектов текущего пользователя. */
  fetchProjects: (opts?: { skipAuthRedirect?: boolean }) => Promise<void>
  /** GET /projects/:id — один проект + его артефакты. */
  fetchProject: (id: number, opts?: { skipAuthRedirect?: boolean }) => Promise<void>
  /** POST /projects — создать проект вручную (name, description?, badge?). */
  createProject: (name: string, description?: string, badge?: string) => Promise<ProjectActionResult>
  /** POST /projects/generate — запускает асинхронную генерацию реального приложения (name, hint?).
   *  Отвечает немедленно (HTTP 202) проектом со статусом 'generating' — прогресс отслеживается
   *  через pollProjectStatus/fetchProject, а не через этот единственный вызов. */
  generateProject: (name: string, hint?: string) => Promise<ProjectActionResult>
  /** Опрашивает GET /projects/:id, пока project.status не станет 'ready'/'failed' (или не истечёт таймаут). */
  pollProjectStatus: (id: number, opts?: { intervalMs?: number; timeoutMs?: number }) => Promise<OsgardProject | null>
  /** GET /projects/:id/files — файлы сгенерированного приложения. */
  fetchProjectFiles: (id: number, opts?: { skipAuthRedirect?: boolean }) => Promise<void>
  /** POST /projects/:id/publish-github — публикует файлы проекта в GitHub одним коммитом. */
  publishProjectToGithub: (id: number, opts?: { repoName?: string; private?: boolean }) => Promise<GithubPublishActionResult>
  /** PUT /projects/:id/files/* — сохраняет содержимое одного файла (Monaco-редактор). */
  saveProjectFile: (id: number, path: string, content: string) => Promise<SaveFileActionResult>
  /** POST /projects/:id/deploy-netlify — запускает асинхронный деплой на Netlify (deploy_status='deploying'). */
  deployProjectToNetlify: (id: number) => Promise<NetlifyDeployActionResult>
  /** Опрашивает GET /projects/:id, пока project.deployStatus не выйдет из 'deploying' (или не истечёт таймаут). */
  pollDeployStatus: (id: number, opts?: { intervalMs?: number; timeoutMs?: number }) => Promise<OsgardProject | null>
  /** PATCH /projects/:id — обновить название/описание/бейдж проекта. */
  updateProject: (id: number, patch: { name?: string; description?: string; badge?: string }) => Promise<ProjectActionResult>
  /** DELETE /projects/:id — удалить проект. */
  deleteProject: (id: number) => Promise<{ success: boolean; error?: string }>
  /** Сбрасывает currentProject/currentProjectArtifacts/currentProjectFiles (например, при выходе со страницы проекта). */
  clearCurrentProject: () => void

  /* ---- TC Wallet: балансы резерва и пользователя ---- */
  /** Баланс резервного пула TC на Solana (в TC). null — не загружен. */
  tcReserveBalance: number | null
  /** Баланс TC пользователя на Solana (в TC). null — не загружен. */
  tcUserBalance: number | null
  /** Флаг загрузки TC-балансов. */
  tcBalanceLoading: boolean
  /** Ошибка загрузки TC-балансов. */
  tcBalanceError: string | null

  /** GET /wallet/tc-balance — загружает tcReserveBalance и tcUserBalance. */
  fetchTcBalance: (opts?: { skipAuthRedirect?: boolean }) => Promise<void>
  /** POST /api/tc/withdraw — конвертирует ∞ в TC на Solana-адрес. Проверяет баланс перед запросом. nonce — текущий nonce пользователя (обязателен, защита от replay-атак; получить через GET /api/tc/nonce). */
  convertToTc: (amount: number, solanaAddress: string, nonce: number, twofaToken?: string) => Promise<{ success: boolean; txId?: string; error?: string }>
  /** POST /api/tc/deposit — принимает on-chain txSignature и зачисляет ∞. */
  convertFromTc: (txSignature: string, amount: number) => Promise<{ success: boolean; error?: string }>

  /* ---- ШАГ 5: агрегированные и локальные хелперы ---- */





  /** Последовательно вызывает все fetch-функции стора. Ошибки одного запроса не прерывают остальные. */
  refreshAll: () => Promise<void>
  /** Сбрасывает состояние стора в начальные значения. */
  reset: () => void
  /** Локально списывает credits из кошелька (без обращения к API). Возвращает false при нехватке средств. */
  spendCredits: (amount: number) => boolean
  /** Локально начисляет credits в кошелёк (без обращения к API). */
  addCredits: (amount: number) => void
}



/* ================================================================
   Начальное состояние
   ================================================================ */

const INITIAL_WALLET: OsgardWallet = {
  cash_usd: 0,
  timecoin: 0,
  credits: 0,
  shards: 0,
  crystals: 0,
}

const INITIAL_TC_PRICE: TcPriceState = {
  price: 12.4,
  minted: 0,
  burned: 0,
  staked: 0,
  circulating: 0,
}

const INITIAL_ORDER_BOOK: OrderBookState = {
  bids: [],
  asks: [],
  spread: 0,
  mid: 0,
}

/** Извлекает читаемое сообщение об ошибке из ApiError/Error/неизвестного значения. */
function extractErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message || fallback
  if (err instanceof Error) return err.message || fallback
  return fallback
}

/* ================================================================
   Store
   ================================================================ */

export const useOsgardStore = create<OsgardStoreState>((set, get) => ({
  wallet: INITIAL_WALLET,
  tcPrice: INITIAL_TC_PRICE,
  priceHistory: [],
  orderBook: INITIAL_ORDER_BOOK,
  trades: [],
  userOrders: [],
  stakes: [],
  artifacts: [],
  marketplaceListings: [],
  leaderboard: [],
  transactions: [],
  projects: [],
  currentProject: null,
  currentProjectArtifacts: [],
  currentProjectFiles: [],

  loading: false,
  error: null,

  tcReserveBalance: null,
  tcUserBalance: null,
  tcBalanceLoading: false,
  tcBalanceError: null,






  /* ---- fetch: GET /wallet ---- */
  fetchWallet: async (opts) => {
    try {
      const { wallet } = await apiClient.get<{ wallet: OsgardWallet }>("/wallet", opts)
      set({ wallet, error: null })
    } catch (err) {
      set({ error: extractErrorMessage(err, "Не удалось загрузить кошелёк") })
    }
  },

  /* ---- fetch: GET /tc-market/state ---- */
  fetchTcState: async (opts) => {
    try {
      const state = await apiClient.get<TcPriceState & { history?: PricePoint[] }>("/tc-market/state", opts)
      const { history, ...tcPrice } = state
      set({
        tcPrice,
        priceHistory: Array.isArray(history) ? history : [],
        error: null,
      })
    } catch (err) {
      set({ error: extractErrorMessage(err, "Не удалось загрузить состояние рынка TimeCoin") })
    }
  },

  /* ---- fetch: GET /tc-market/orderbook ---- */
  fetchOrderBook: async (opts) => {
    try {
      const book = await apiClient.get<OrderBookState>("/tc-market/orderbook", opts)
      set({ orderBook: book, error: null })
    } catch (err) {
      set({ error: extractErrorMessage(err, "Не удалось загрузить стакан заявок") })
    }
  },

  /* ---- fetch: GET /tc-market/trades ---- */
  fetchTrades: async (opts) => {
    try {
      const { trades } = await apiClient.get<{ trades: TcTrade[] }>("/tc-market/trades", opts)
      set({ trades, error: null })
    } catch (err) {
      set({ error: extractErrorMessage(err, "Не удалось загрузить историю сделок") })
    }
  },

  /* ---- fetch: GET /tc-market/orders — заявки текущего пользователя ---- */
  fetchUserOrders: async (opts) => {
    try {
      const { orders } = await apiClient.get<{ orders: UserOrder[] }>("/tc-market/orders", opts)
      set({ userOrders: orders, error: null })
    } catch (err) {
      set({ error: extractErrorMessage(err, "Не удалось загрузить заявки пользователя") })
    }
  },

  /* ---- action: POST /tc-market/order — разместить лимитную заявку ---- */
  createLimitOrder: async (side, price, amount) => {
    set({ loading: true, error: null })
    try {
      const res = await apiClient.post<{
        order: UserOrder
        trades: TcTrade[]
        wallet: OsgardWallet
        orderbook: OrderBookState
      }>("/tc-market/order", { side, price, amount })

      set((s) => ({
        userOrders: [res.order, ...s.userOrders],
        orderBook: res.orderbook,
        wallet: res.wallet,
        loading: false,
        error: null,
      }))

      // синхронизация с сервером после мутации
      await Promise.all([get().fetchWallet(), get().fetchOrderBook()])

      return { success: true }
    } catch (err) {
      const message = extractErrorMessage(err, "Не удалось разместить заявку")
      set({ loading: false, error: message })
      return { success: false, error: message }
    }
  },

  /* ---- action: DELETE /tc-market/order/:id — отменить заявку ---- */
  cancelOrder: async (orderId) => {
    set({ loading: true, error: null })
    try {
      const res = await apiClient.delete<{
        order: UserOrder
        wallet: OsgardWallet
        orderbook: OrderBookState
      }>(`/tc-market/order/${orderId}`)

      set((s) => ({
        userOrders: s.userOrders.map((o) => (o.id === res.order.id ? res.order : o)),
        orderBook: res.orderbook,
        wallet: res.wallet,
        loading: false,
        error: null,
      }))

      // синхронизация с сервером после мутации
      await Promise.all([get().fetchWallet(), get().fetchOrderBook()])

      return { success: true }
    } catch (err) {
      const message = extractErrorMessage(err, "Не удалось отменить заявку")
      set({ loading: false, error: message })
      return { success: false, error: message }
    }
  },

  /* ---- action: POST /tc-market/buy — маркет-покупка TimeCoin на сумму usdAmount ---- */
  createMarketBuy: async (usdAmount) => {
    set({ loading: true, error: null })
    try {
      const res = await apiClient.post<{
        wallet: OsgardWallet
        trade: MarketTradeInfo
        trades: TcTrade[]
      }>("/tc-market/buy", { usdAmount })

      set((s) => ({
        wallet: res.wallet,
        tcPrice: { ...s.tcPrice, price: res.trade.newPrice },
        loading: false,
        error: null,
      }))

      // синхронизация с сервером после мутации
      await Promise.all([get().fetchWallet(), get().fetchOrderBook(), get().fetchTrades(), get().fetchTcState()])

      return { success: true, trade: res.trade }
    } catch (err) {
      const message = extractErrorMessage(err, "Не удалось выполнить покупку")
      set({ loading: false, error: message })
      return { success: false, error: message }
    }
  },

  /* ---- action: POST /tc-market/sell — маркет-продажа tcAmount TimeCoin ---- */
  createMarketSell: async (tcAmount) => {
    set({ loading: true, error: null })
    try {
      const res = await apiClient.post<{
        wallet: OsgardWallet
        trade: MarketTradeInfo
        trades: TcTrade[]
      }>("/tc-market/sell", { tcAmount })

      set((s) => ({
        wallet: res.wallet,
        tcPrice: { ...s.tcPrice, price: res.trade.newPrice },
        loading: false,
        error: null,
      }))

      // синхронизация с сервером после мутации
      await Promise.all([get().fetchWallet(), get().fetchOrderBook(), get().fetchTrades(), get().fetchTcState()])

      return { success: true, trade: res.trade }
    } catch (err) {
      const message = extractErrorMessage(err, "Не удалось выполнить продажу")
      set({ loading: false, error: message })
      return { success: false, error: message }
    }
  },

  /* ---- fetch: GET /stakes — стейки текущего пользователя ---- */
  fetchStakes: async (opts) => {
    try {
      const { stakes } = await apiClient.get<{ stakes: OsgardStake[] }>("/stakes", opts)
      set({ stakes, error: null })
    } catch (err) {
      set({ error: extractErrorMessage(err, "Не удалось загрузить стейки") })
    }
  },

  /* ---- action: POST /stakes — открыть стейк TimeCoin ---- */
  stakeTC: async (amount, days) => {
    set({ loading: true, error: null })
    try {
      const res = await apiClient.post<{ stake: OsgardStake }>("/stakes", { amount, days })

      set((s) => ({
        stakes: [res.stake, ...s.stakes],
        loading: false,
        error: null,
      }))

      // синхронизация с сервером после мутации
      await Promise.all([get().fetchWallet(), get().fetchStakes(), get().fetchTcState()])

      return { success: true, stake: res.stake }
    } catch (err) {
      const message = extractErrorMessage(err, "Не удалось открыть стейк")
      set({ loading: false, error: message })
      return { success: false, error: message }
    }
  },

  /* ---- action: POST /stakes/:id/unstake — закрыть стейк ---- */
  unstakeTC: async (stakeId) => {
    set({ loading: true, error: null })
    try {
      const res = await apiClient.post<{
        stake: OsgardStake
        reward: number
        totalReturn: number
        matured: boolean
      }>(`/stakes/${stakeId}/unstake`)

      set((s) => ({
        stakes: s.stakes.map((st) => (st.id === res.stake.id ? res.stake : st)),
        loading: false,
        error: null,
      }))

      // синхронизация с сервером после мутации
      await Promise.all([get().fetchWallet(), get().fetchStakes(), get().fetchTcState()])

      return {
        success: true,
        stake: res.stake,
        reward: res.reward,
        totalReturn: res.totalReturn,
        matured: res.matured,
      }
    } catch (err) {
      const message = extractErrorMessage(err, "Не удалось снять стейк")
      set({ loading: false, error: message })
      return { success: false, error: message }
    }
  },

  /* ---- action: POST /wallet/convert — конвертация валют кошелька ---- */
  convertCurrency: async (from, to, amount) => {
    set({ loading: true, error: null })
    try {
      const res = await apiClient.post<{
        wallet: OsgardWallet
        conversion: {
          from: CurrencyKey
          to: CurrencyKey
          amountSent: number
          amountReceived: number
          fee: number
        }
      }>("/wallet/convert", { fromCurrency: from, toCurrency: to, amount })

      set({
        wallet: res.wallet,
        loading: false,
        error: null,
      })

      // синхронизация с сервером после мутации
      await get().fetchWallet()

      return { success: true, conversion: res.conversion }
    } catch (err) {
      const message = extractErrorMessage(err, "Не удалось выполнить конвертацию валюты")
      set({ loading: false, error: message })
      return { success: false, error: message }
    }
  },

  /* ---- action: GET /wallet/lookup-recipient — предпросмотр получателя перевода TC ----
     Не трогает глобальные loading/error — используется для live-поиска при вводе email. */
  lookupRecipient: async (email) => {
    try {
      return await apiClient.get<RecipientLookupResult>(
        `/wallet/lookup-recipient?email=${encodeURIComponent(email)}`,
      )
    } catch (err) {
      return { found: false, error: extractErrorMessage(err, "Не удалось найти получателя") }
    }
  },

  /* ---- action: POST /wallet/transfer — перевод TC другому пользователю ---- */
  transferTC: async (recipientEmail, amount, comment, password, twofaToken) => {
    set({ loading: true, error: null })
    try {
      const res = await apiClient.post<{
        wallet: OsgardWallet
        transfer: { recipientEmail: string; recipientName: string; amount: number; comment: string }
      }>("/wallet/transfer", {
        recipientEmail,
        amount,
        comment,
        password,
        twofa_token: twofaToken,
      })

      set({ wallet: res.wallet, loading: false, error: null })

      // синхронизация с сервером после мутации
      await Promise.all([get().fetchWallet(), get().fetchTransactions()])

      return { success: true, transfer: res.transfer }
    } catch (err) {
      const message = extractErrorMessage(err, "Не удалось выполнить перевод TC")
      set({ loading: false, error: message })
      return { success: false, error: message }
    }
  },

  /* ---- fetch: GET /artifacts/mine — артефакты текущего пользователя ---- */
  fetchArtifacts: async (opts) => {
    try {
      const { artifacts } = await apiClient.get<{ artifacts: OsgardArtifact[] }>("/artifacts/mine", opts)
      set({ artifacts, error: null })
    } catch (err) {
      set({ error: extractErrorMessage(err, "Не удалось загрузить артефакты") })
    }
  },

  /* ---- action: POST /artifacts/forge — создать новый артефакт ---- */
  forgeArtifact: async (name, type, projectId) => {
    set({ loading: true, error: null })
    try {
      const res = await apiClient.post<{ artifact: OsgardArtifact }>("/artifacts/forge", { name, type, projectId })

      set((s) => ({
        artifacts: [res.artifact, ...s.artifacts],
        loading: false,
        error: null,
      }))

      // синхронизация с сервером после мутации
      await get().fetchWallet()
      // если артефакт привязан к проекту — обновляем artifactCount в списке проектов
      if (projectId) await get().fetchProjects()

      return { success: true, artifact: res.artifact }
    } catch (err) {
      const message = extractErrorMessage(err, "Не удалось создать артефакт")
      set({ loading: false, error: message })
      return { success: false, error: message }
    }
  },

  /* ---- action: POST /artifacts/generate-ai — AI-генерация уникального артефакта ---- */
  generateAiArtifact: async (hint) => {
    set({ loading: true, error: null })
    try {
      const res = await apiClient.post<{ artifact: OsgardArtifact; aiSource: "grok" | "deepseek" | "fallback" }>(
        "/artifacts/generate-ai",
        { hint },
      )

      set((s) => ({
        artifacts: [res.artifact, ...s.artifacts],
        loading: false,
        error: null,
      }))

      // синхронизация с сервером после мутации
      await get().fetchWallet()

      return { success: true, artifact: res.artifact, aiSource: res.aiSource }
    } catch (err) {
      const message = extractErrorMessage(err, "Не удалось сгенерировать артефакт")
      set({ loading: false, error: message })
      return { success: false, error: message }
    }
  },

  /* ---- action: POST /artifacts/:id/premium-upgrade — премиум-усиление за TimeCoin ---- */
  premiumUpgradeArtifact: async (artifactId) => {
    set({ loading: true, error: null })
    try {
      const res = await apiClient.post<{
        artifact: OsgardArtifact
        critical: boolean
        levelGain: number
        cost: number
      }>(`/artifacts/${artifactId}/premium-upgrade`)

      set((s) => ({
        artifacts: s.artifacts.map((a) => (a.id === res.artifact.id ? res.artifact : a)),
        loading: false,
        error: null,
      }))

      // синхронизация с сервером после мутации
      await get().fetchWallet()

      return {
        success: true,
        artifact: res.artifact,
        critical: res.critical,
        levelGain: res.levelGain,
        cost: res.cost,
      }
    } catch (err) {
      const message = extractErrorMessage(err, "Не удалось выполнить премиум-усиление")
      set({ loading: false, error: message })
      return { success: false, error: message }
    }
  },

  /* ---- fetch: GET /marketplace/listings — все активные лоты маркетплейса ---- */
  fetchListings: async (opts) => {
    try {
      const { listings } = await apiClient.get<{ listings: MarketListing[] }>("/marketplace/listings", opts)
      set({ marketplaceListings: listings, error: null })
    } catch (err) {
      set({ error: extractErrorMessage(err, "Не удалось загрузить лоты маркетплейса") })
    }
  },

  /* ---- action: POST /marketplace/:id/buy — купить лот ---- */
  buyListing: async (listingId) => {
    set({ loading: true, error: null })
    try {
      const res = await apiClient.post<{ wallet: OsgardWallet }>(`/marketplace/${listingId}/buy`)

      set((s) => ({
        wallet: res.wallet,
        marketplaceListings: s.marketplaceListings.filter((l) => l.id !== listingId),
        loading: false,
        error: null,
      }))

      // синхронизация с сервером после мутации
      await Promise.all([get().fetchWallet(), get().fetchListings()])

      return { success: true }
    } catch (err) {
      const message = extractErrorMessage(err, "Не удалось купить артефакт")
      set({ loading: false, error: message })
      return { success: false, error: message }
    }
  },

  /* ---- fetch: GET /leaderboard — рейтинг архитекторов по доходу/продажам/уровню ---- */
  fetchLeaderboard: async (opts) => {
    try {
      const { leaderboard } = await apiClient.get<{ leaderboard: LeaderboardEntry[] }>("/leaderboard", opts)
      set({ leaderboard, error: null })
    } catch (err) {
      set({ error: extractErrorMessage(err, "Не удалось загрузить рейтинг архитекторов") })
    }
  },

  /* ---- fetch: GET /transactions — история транзакций текущего пользователя ---- */
  fetchTransactions: async (opts) => {
    try {
      const { transactions } = await apiClient.get<{ transactions: OsgardTransaction[] }>("/transactions", opts)
      set({ transactions, error: null })
    } catch (err) {
      set({ error: extractErrorMessage(err, "Не удалось загрузить историю транзакций") })
    }
  },


  /* ---- проекты: GET /projects/mine — список проектов текущего пользователя ---- */
  fetchProjects: async (opts) => {
    try {
      const { projects } = await apiClient.get<{ projects: OsgardProject[] }>("/projects/mine", opts)
      set({ projects, error: null })
    } catch (err) {
      set({ error: extractErrorMessage(err, "Не удалось загрузить проекты") })
    }
  },

  /* ---- проекты: GET /projects/:id — один проект + его артефакты ---- */
  fetchProject: async (id, opts) => {
    try {
      const res = await apiClient.get<{ project: OsgardProject; artifacts: OsgardArtifact[] }>(`/projects/${id}`, opts)
      set((s) => ({
        // Обновляем currentProject только если пользователь всё ещё смотрит именно этот
        // проект (или ни один не открыт) — иначе фоновый поллинг чужого проекта (например,
        // из визарда создания, открытого поверх уже просматриваемого проекта) затирает
        // currentProject/currentProjectArtifacts данными другого проекта.
        currentProject: !s.currentProject || s.currentProject.id === id ? res.project : s.currentProject,
        currentProjectArtifacts: !s.currentProject || s.currentProject.id === id ? res.artifacts : s.currentProjectArtifacts,
        // синхронизируем и список проектов — карточка в списке тоже видит смену status
        projects: s.projects.map((p) => (p.id === id ? res.project : p)),
        error: null,
      }))
    } catch (err) {
      set({ error: extractErrorMessage(err, "Не удалось загрузить проект") })
    }
  },

  /* ---- проекты: POST /projects — создать проект вручную ---- */
  createProject: async (name, description, badge) => {
    set({ loading: true, error: null })
    try {
      const res = await apiClient.post<{ project: OsgardProject }>("/projects", { name, description, badge })

      set((s) => ({
        projects: [res.project, ...s.projects],
        loading: false,
        error: null,
      }))

      return { success: true, project: res.project }
    } catch (err) {
      const message = extractErrorMessage(err, "Не удалось создать проект")
      set({ loading: false, error: message })
      return { success: false, error: message }
    }
  },

  /* ---- проекты: POST /projects/generate — запуск асинхронной генерации реального приложения ----
     Отвечает немедленно (HTTP 202): проект уже создан со status='generating' и стартовыми
     артефактами, но файлы приложения ещё генерируются в фоне на сервере. Вызывающий код
     (визард) должен продолжить через pollProjectStatus, а не считать проект готовым сразу. */
  generateProject: async (name, hint) => {
    set({ loading: true, error: null })
    try {
      const res = await apiClient.post<{
        project: OsgardProject
        artifacts: OsgardArtifact[]
        aiConfigured: boolean
      }>("/projects/generate", { name, hint })

      set((s) => ({
        projects: [res.project, ...s.projects],
        loading: false,
        error: null,
      }))

      // синхронизация артефактов пользователя (стартовые артефакты проекта уже созданы на сервере)
      await get().fetchArtifacts()

      return {
        success: true,
        project: res.project,
        artifacts: res.artifacts,
        aiConfigured: res.aiConfigured,
      }
    } catch (err) {
      const message = extractErrorMessage(err, "Не удалось сгенерировать проект")
      set({ loading: false, error: message })
      return { success: false, error: message }
    }
  },

  /* ---- проекты: опрос статуса генерации до перехода из 'generating' в 'ready'/'failed' ---- */
  pollProjectStatus: async (id, opts) => {
    const intervalMs = opts?.intervalMs ?? 2000
    const timeoutMs = opts?.timeoutMs ?? 120000
    const startedAt = Date.now()

    while (true) {
      await get().fetchProject(id)
      const project = get().projects.find((p) => p.id === id) ?? get().currentProject
      if (project && project.id === id && project.status !== "generating") {
        return project
      }
      if (Date.now() - startedAt >= timeoutMs) {
        return project ?? null
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs))
    }
  },

  /* ---- проекты: GET /projects/:id/files — файлы сгенерированного приложения ---- */
  fetchProjectFiles: async (id, opts) => {
    try {
      const { files } = await apiClient.get<{ files: OsgardProjectFile[] }>(`/projects/${id}/files`, opts)
      set({ currentProjectFiles: files, error: null })
    } catch (err) {
      set({ error: extractErrorMessage(err, "Не удалось загрузить файлы проекта") })
    }
  },

  /* ---- проекты: POST /projects/:id/publish-github — публикация файлов проекта одним коммитом ---- */
  publishProjectToGithub: async (id, opts) => {
    set({ loading: true, error: null })
    try {
      const res = await apiClient.post<{ repoUrl: string; commitSha: string }>(`/projects/${id}/publish-github`, opts || {})
      set({ loading: false, error: null })
      return { success: true, repoUrl: res.repoUrl, commitSha: res.commitSha }
    } catch (err) {
      const message = extractErrorMessage(err, "Не удалось опубликовать проект в GitHub")
      set({ loading: false, error: message })
      return { success: false, error: message }
    }
  },

  /* ---- проекты: PUT /projects/:id/files/* — сохранить содержимое одного файла ---- */
  saveProjectFile: async (id, path, content) => {
    try {
      const res = await apiClient.put<{ path: string; updatedAt: number; errors: string[] }>(
        `/projects/${id}/files/${path}`,
        { content },
      )
      set((s) => ({
        currentProjectFiles: s.currentProjectFiles.map((f) =>
          f.path === path ? { ...f, content, updatedAt: res.updatedAt } : f,
        ),
        error: null,
      }))
      return { success: true, errors: res.errors }
    } catch (err) {
      const message = extractErrorMessage(err, "Не удалось сохранить файл")
      set({ error: message })
      return { success: false, error: message }
    }
  },

  /* ---- проекты: POST /projects/:id/deploy-netlify — запуск асинхронного деплоя ---- */
  deployProjectToNetlify: async (id) => {
    set({ loading: true, error: null })
    try {
      const res = await apiClient.post<{ project: OsgardProject }>(`/projects/${id}/deploy-netlify`)
      set((s) => ({
        loading: false,
        error: null,
        currentProject: s.currentProject?.id === id ? res.project : s.currentProject,
        projects: s.projects.map((p) => (p.id === id ? res.project : p)),
      }))
      return { success: true, project: res.project }
    } catch (err) {
      const message = extractErrorMessage(err, "Не удалось запустить деплой на Netlify")
      set({ loading: false, error: message })
      return { success: false, error: message }
    }
  },

  /* ---- проекты: опрос статуса деплоя до перехода из 'deploying' в 'deployed'/'failed' ---- */
  pollDeployStatus: async (id, opts) => {
    const intervalMs = opts?.intervalMs ?? 2000
    const timeoutMs = opts?.timeoutMs ?? 180000
    const startedAt = Date.now()

    while (true) {
      await get().fetchProject(id)
      const project = get().projects.find((p) => p.id === id) ?? get().currentProject
      if (project && project.id === id && project.deployStatus !== "deploying") {
        return project
      }
      if (Date.now() - startedAt >= timeoutMs) {
        return project ?? null
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs))
    }
  },

  /* ---- проекты: PATCH /projects/:id — обновить название/описание/бейдж ---- */
  updateProject: async (id, patch) => {
    set({ loading: true, error: null })
    try {
      const res = await apiClient.patch<{ project: OsgardProject }>(`/projects/${id}`, patch)

      set((s) => ({
        projects: s.projects.map((p) => (p.id === id ? res.project : p)),
        currentProject: s.currentProject && s.currentProject.id === id ? res.project : s.currentProject,
        loading: false,
        error: null,
      }))

      return { success: true, project: res.project }
    } catch (err) {
      const message = extractErrorMessage(err, "Не удалось обновить проект")
      set({ loading: false, error: message })
      return { success: false, error: message }
    }
  },

  /* ---- проекты: DELETE /projects/:id — удалить проект ---- */
  deleteProject: async (id) => {
    set({ loading: true, error: null })
    try {
      await apiClient.delete(`/projects/${id}`)

      set((s) => ({
        projects: s.projects.filter((p) => p.id !== id),
        currentProject: s.currentProject && s.currentProject.id === id ? null : s.currentProject,
        currentProjectArtifacts: s.currentProject && s.currentProject.id === id ? [] : s.currentProjectArtifacts,
        loading: false,
        error: null,
      }))

      return { success: true }
    } catch (err) {
      const message = extractErrorMessage(err, "Не удалось удалить проект")
      set({ loading: false, error: message })
      return { success: false, error: message }
    }
  },

  /* ---- проекты: локальный сброс текущего открытого проекта ---- */
  clearCurrentProject: () => {
    set({ currentProject: null, currentProjectArtifacts: [], currentProjectFiles: [] })
  },

  /* ---- ШАГ 5: refreshAll — последовательно обновляет все данные стора.




     Каждый fetch уже сам ловит свои ошибки и пишет их в state.error,
     поэтому здесь достаточно последовательных await без try/catch —
     но на всякий случай оборачиваем каждый вызов отдельно, чтобы падение
     одного fetch не прервало цепочку остальных. ---- */
  refreshAll: async () => {
    const {
      fetchWallet,
      fetchTcState,
      fetchOrderBook,
      fetchTrades,
      fetchUserOrders,
      fetchStakes,
      fetchArtifacts,
      fetchListings,
      fetchLeaderboard,
      fetchTransactions,
      fetchProjects,
    } = get()

    const steps: Array<() => Promise<void>> = [
      fetchWallet,
      fetchTcState,
      fetchOrderBook,
      fetchTrades,
      fetchUserOrders,
      fetchStakes,
      fetchArtifacts,
      fetchListings,
      fetchLeaderboard,
      fetchTransactions,
      fetchProjects,
    ]






    for (const step of steps) {
      try {
        await step()
      } catch (err) {
        // fetch-функции сами пишут ошибку в state.error и не бросают наружу,
        // но на случай непредвиденного исключения — не прерываем цепочку.
        set({ error: extractErrorMessage(err, "Не удалось обновить данные") })
      }
    }
  },

  /* ---- ШАГ 5: reset — сбрасывает состояние стора в начальные значения ---- */
  reset: () => {
    set({
      wallet: INITIAL_WALLET,
      tcPrice: INITIAL_TC_PRICE,
      priceHistory: [],
      orderBook: INITIAL_ORDER_BOOK,
      trades: [],
      userOrders: [],
      stakes: [],
      artifacts: [],
      marketplaceListings: [],
      leaderboard: [],
      transactions: [],
      projects: [],
      currentProject: null,
      currentProjectArtifacts: [],
      currentProjectFiles: [],
      loading: false,
      error: null,
    })
  },






  /* ----------------------------------------------------------------
     fetchTcBalance — GET /wallet/tc-balance
     Загружает tcReserveBalance (резерв пула) и tcUserBalance (баланс юзера)
     и сохраняет их в стор.
     ---------------------------------------------------------------- */
  fetchTcBalance: async (opts) => {
    set({ tcBalanceLoading: true, tcBalanceError: null })
    try {
      const data = await apiClient.get<{ reserveBalance: number; userBalance: number }>("/wallet/tc-balance", opts)
      set({
        tcReserveBalance: data.reserveBalance,
        tcUserBalance: data.userBalance,
        tcBalanceLoading: false,
      })
    } catch (err: unknown) {
      set({
        tcBalanceError: extractErrorMessage(err, "Не удалось загрузить баланс TC"),
        tcBalanceLoading: false,
      })
    }
  },

  /* ----------------------------------------------------------------
     convertToTc — ∞ → TC (POST /api/tc/withdraw)
     Проверяет баланс ∞, затем отправляет TC с боевого treasury-кошелька
     (единственная реально настроенная и захардненная интеграция —
     TREASURY_SECRET_KEY/TC_MINT_ADDRESS; см. docs/solana-reserve-audit.md).
     nonce обязателен — сервер отклонит запрос без него (защита от replay).
     ---------------------------------------------------------------- */
  convertToTc: async (amount: number, solanaAddress: string, nonce: number, twofaToken?: string) => {
    const { wallet } = get()
    if (wallet.timecoin < amount) {
      return { success: false, error: "Недостаточно ∞ для конвертации" }
    }
    set({ loading: true, error: null })
    try {
      const body: Record<string, unknown> = { amount, externalWalletAddress: solanaAddress, nonce }
      if (twofaToken) body.twofa_token = twofaToken
      const data = await apiClient.post<{ success: boolean; signature: string }>("/api/tc/withdraw", body)
      // обновляем баланс ∞ и TC-баланс после конвертации
      get().fetchWallet()
      get().fetchTcBalance()
      return { success: true, txId: data.signature }
    } catch (err: unknown) {
      const msg = extractErrorMessage(err, "Не удалось выполнить конвертацию ∞ → TC")
      set({ error: msg })
      return { success: false, error: msg }
    } finally {
      set({ loading: false })
    }
  },

  /* ----------------------------------------------------------------
     convertFromTc — TC → ∞ (POST /api/tc/deposit)
     Принимает txSignature on-chain перевода TC в казначейство и зачисляет ∞.
     ---------------------------------------------------------------- */
  convertFromTc: async (txSignature: string, amount: number) => {
    set({ loading: true, error: null })
    try {
      await apiClient.post<{ success: boolean; amountCreditedInfinity: number }>("/api/tc/deposit", {
        txSignature,
        amount,
      })
      // обновляем баланс ∞ и TC-баланс после конвертации
      get().fetchWallet()
      get().fetchTcBalance()
      return { success: true }
    } catch (err: unknown) {
      const msg = extractErrorMessage(err, "Не удалось выполнить конвертацию TC → ∞")
      set({ error: msg })
      return { success: false, error: msg }
    } finally {
      set({ loading: false })
    }
  },

  /* ---- ШАГ 5: spendCredits — локальная UI-операция, без обращения к API.
     Используется, например, для мгновенного списания credits в интерфейсе
     (крафт/апгрейд), пока реального эндпоинта под это ещё нет. ---- */
  spendCredits: (amount) => {
    if (!Number.isFinite(amount) || amount <= 0) return false
    let ok = true
    set((s) => {
      if (s.wallet.credits < amount) {
        ok = false
        return s
      }
      return { wallet: { ...s.wallet, credits: s.wallet.credits - amount } }
    })
    return ok
  },

  /* ---- ШАГ 5: addCredits — локальная UI-операция, без обращения к API. ---- */
  addCredits: (amount) => {
    if (!Number.isFinite(amount) || amount <= 0) return
    set((s) => ({ wallet: { ...s.wallet, credits: s.wallet.credits + amount } }))
  },
}))



export default useOsgardStore

/* ================================================================
   OSGARD global store — compatibility shim.
   ----------------------------------------------------------------
   Раньше это был отдельный React Context с полностью фейковым,
   ни с чем не связанным состоянием (seed-генераторы, ноль запросов
   к бэкенду). Из-за этого баланс/TC расходились между страницами,
   использующими этот хук, и страницами, использующими настоящий
   Zustand-стор выше в этом же файле.

   Теперь это тонкая обёртка над useOsgardStore() — единственным
   источником правды. Внешний контракт (useOsgard(), форма
   StoreValue) сохранён без изменений, чтобы не трогать
   файлы-потребители.
   ================================================================ */

const CURRENCY_KEYS: CurrencyId[] = ["credits", "shards", "crystals", "timecoin"]

type ExchangeResult = { ok: boolean; message: string }

type StoreValue = {
  wallet: Wallet
  /** Convert `amount` of a lower-tier currency up into the next tier. */
  exchangeUp: (from: CurrencyId, amount: number) => ExchangeResult
  /** Add TimeCoin (e.g. after a fiat purchase). */
  addTC: (amount: number) => void
  /** Spend TimeCoin (upgrades, crafting, purchases). Returns false if insufficient. */
  spendTC: (amount: number) => boolean
  /** Spend any currency. Returns false if insufficient. */
  spend: (currency: CurrencyId, amount: number) => boolean
  /** Credit `amount` of a currency to the wallet. */
  credit: (currency: CurrencyId, amount: number) => void
  /** Convert to receive `wantTo` units of `to`, paying in `from` (1% fee). */
  convert: (wantTo: number, from: CurrencyId, to: CurrencyId) => Promise<ExchangeResult>
  /** Total net worth expressed in TimeCoin. */
  netWorthTC: number
  /** USD value of a TC amount at the live market price. */
  usdFor: (tc: number) => number

  /* ---- TimeCoin market (real backend-driven data) ---- */
  tcPrice: number
  priceHistory: PricePoint[]
  tcTrades: TCTrade[]
  tcTransactions: TCTransaction[]
  stakes: Stake[]
  orderBook: OrderBook
  cashUSD: number
  burnedTC: number
  stakedTC: number
  circulatingTC: number
  marketCapUSD: number
  volume24hTC: number
  change24h: number
  changeMonth: number

  buyTC: (usd: number) => Promise<ExchangeResult>
  sellTC: (tc: number) => Promise<ExchangeResult>
  stakeTC: (amount: number, days: number) => Promise<ExchangeResult>
  unstakeTC: (id: string) => Promise<ExchangeResult>
  recordBurn: (amount: number, note?: string) => void
}

const StoreContext = createContext<StoreValue | null>(null)

export function OsgardStoreProvider({ children }: { children: ReactNode }) {
  const real = useOsgardStore()
  const { user } = useAuth()

  useEffect(() => {
    // skipAuthRedirect: это фоновая гидратация при монтировании (на ВСЕХ страницах,
    // включая гостевые/публичные) — гостю с истёкшей/отсутствующей сессией нельзя
    // насильно рвать навигацию редиректом на /login из-за неё.
    // Зависимость от user?.id: после клиентского router.push() при логине/логауте
    // (app/login/page.tsx) этот провайдер не размонтируется — без этой зависимости
    // кошелёк/TC/ордера остались бы данными гостя (нули) до полной перезагрузки страницы.
    const opts = { skipAuthRedirect: true }
    real.fetchWallet(opts)
    real.fetchTcState(opts)
    real.fetchOrderBook(opts)
    real.fetchTrades(opts)
    real.fetchStakes(opts)
    real.fetchTransactions(opts)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  const wallet = useMemo<Wallet>(
    () => ({
      credits: real.wallet.credits,
      shards: real.wallet.shards,
      crystals: real.wallet.crystals,
      timecoin: real.wallet.timecoin,
    }),
    [real.wallet],
  )

  /** Локальная (без бэкенда) синхронная мутация общего Zustand-кошелька. */
  const localWalletMutate = useCallback((mutator: (w: Wallet) => Wallet) => {
    useOsgardStore.setState((s) => {
      const next = mutator({
        credits: s.wallet.credits,
        shards: s.wallet.shards,
        crystals: s.wallet.crystals,
        timecoin: s.wallet.timecoin,
      })
      return { wallet: { ...s.wallet, ...next } }
    })
  }, [])

  const exchangeUp = useCallback<StoreValue["exchangeUp"]>(
    (from, amount) => {
      const idx = CURRENCY_KEYS.indexOf(from)
      if (idx < 0 || idx >= CURRENCY_KEYS.length - 1) {
        return { ok: false, message: "Нельзя обменять эту валюту вверх" }
      }
      const target = CURRENCY_KEYS[idx + 1]
      const rate = CURRENCIES[target].ratePerLower
      if (amount <= 0 || amount % rate !== 0) {
        return { ok: false, message: `Сумма должна быть кратна ${rate}` }
      }
      let ok = true
      localWalletMutate((w) => {
        if (w[from] < amount) {
          ok = false
          return w
        }
        const gained = Math.floor(amount / rate)
        return { ...w, [from]: w[from] - amount, [target]: w[target] + gained }
      })
      return ok
        ? { ok: true, message: `Обменяно ${amount} → ${Math.floor(amount / rate)} ${CURRENCIES[target].symbol}` }
        : { ok: false, message: "Недостаточно средств" }
    },
    [localWalletMutate],
  )

  const addTC = useCallback<StoreValue["addTC"]>(
    (amount) => {
      localWalletMutate((w) => ({ ...w, timecoin: w.timecoin + amount }))
    },
    [localWalletMutate],
  )

  const spendTC = useCallback<StoreValue["spendTC"]>(
    (amount) => {
      let ok = true
      localWalletMutate((w) => {
        if (w.timecoin < amount) {
          ok = false
          return w
        }
        return { ...w, timecoin: w.timecoin - amount }
      })
      return ok
    },
    [localWalletMutate],
  )

  const spend = useCallback<StoreValue["spend"]>(
    (currency, amount) => {
      let ok = true
      localWalletMutate((w) => {
        if (w[currency] < amount) {
          ok = false
          return w
        }
        return { ...w, [currency]: w[currency] - amount }
      })
      return ok
    },
    [localWalletMutate],
  )

  const credit = useCallback<StoreValue["credit"]>(
    (currency, amount) => {
      localWalletMutate((w) => ({ ...w, [currency]: w[currency] + amount }))
    },
    [localWalletMutate],
  )

  const convert = useCallback<StoreValue["convert"]>(
    async (wantTo, from, to) => {
      if (from === to) return { ok: false, message: "Выберите разные валюты" }
      if (wantTo <= 0) return { ok: false, message: "Введите сумму" }
      const quote = convertQuote(wantTo, from, to)
      const res = await real.convertCurrency(from as CurrencyKey, to as CurrencyKey, quote.give)
      if (!res.success || !res.conversion) {
        return { ok: false, message: res.error || `Недостаточно ${CURRENCIES[from].label.toLowerCase()}` }
      }
      return {
        ok: true,
        message: `Обмен выполнен: −${res.conversion.amountSent.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ${CURRENCIES[from].symbol} → +${res.conversion.amountReceived.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ${CURRENCIES[to].symbol}`,
      }
    },
    [real],
  )

  const netWorthTC = useMemo(
    () => CURRENCY_KEYS.reduce((sum, id) => sum + toCredits(wallet[id], id) / CURRENCIES.timecoin.creditRate, 0),
    [wallet],
  )

  const tcPriceNum = real.tcPrice.price
  const usdFor = useCallback<StoreValue["usdFor"]>((tc) => tc * tcPriceNum, [tcPriceNum])

  const burnedTC = real.tcPrice.burned
  const stakedTC = real.tcPrice.staked
  const circulatingTC = real.tcPrice.circulating
  const marketCapUSD = circulatingTC * tcPriceNum

  const volume24hTC = useMemo(() => {
    const from = Date.now() - DAY_MS
    return real.trades.filter((t) => t.ts >= from).reduce((s, t) => s + t.amount, 0)
  }, [real.trades])

  const change24h = useMemo(() => {
    const from = Date.now() - DAY_MS
    const past = [...real.priceHistory].reverse().find((p) => p.ts <= from)
    return past ? pctChange(past.price, tcPriceNum) : 0
  }, [real.priceHistory, tcPriceNum])

  const changeMonth = useMemo(() => {
    const from = Date.now() - 30 * DAY_MS
    const past = [...real.priceHistory].reverse().find((p) => p.ts <= from)
    return past ? pctChange(past.price, tcPriceNum) : 0
  }, [real.priceHistory, tcPriceNum])

  const orderBook = useMemo<OrderBook>(() => {
    const withTotal = (levels: { price: number; amount: number }[]): OrderRow[] => {
      let total = 0
      return levels.map((l) => {
        total += l.amount
        return { price: l.price, amount: l.amount, total: Math.round(total * 100) / 100 }
      })
    }
    return {
      bids: withTotal(real.orderBook.bids),
      asks: withTotal(real.orderBook.asks),
      spread: real.orderBook.spread,
      mid: real.orderBook.mid,
    }
  }, [real.orderBook])

  const tcTrades = useMemo<TCTrade[]>(
    () => real.trades.map((t) => ({ id: String(t.id), ts: t.ts, price: t.price, amount: t.amount, side: t.side })),
    [real.trades],
  )

  const stakes = useMemo<Stake[]>(
    () =>
      real.stakes.map((s) => {
        const term = STAKE_TERMS.find((t) => t.days === s.days)
        return {
          id: String(s.id),
          amountTC: s.amountTC,
          days: s.days,
          apr: s.apr,
          marketFee: term?.marketFee ?? 0,
          startTs: s.startTs,
          endTs: s.endTs,
          status: s.status,
        }
      }),
    [real.stakes],
  )

  const tcTransactions = useMemo<TCTransaction[]>(() => {
    const knownKinds: TxKind[] = ["buy", "sell", "burn", "stake", "unstake"]
    return real.transactions.map((t) => ({
      id: String(t.id),
      kind: (knownKinds as string[]).includes(t.type) ? (t.type as TxKind) : "buy",
      amountTC: t.currency === "timecoin" ? t.amount : 0,
      amountUSD: t.currency === "cash_usd" ? t.amount : 0,
      price: tcPriceNum,
      ts: t.createdAt,
    }))
  }, [real.transactions, tcPriceNum])

  const buyTC = useCallback<StoreValue["buyTC"]>(
    async (usd) => {
      if (usd <= 0) return { ok: false, message: "Введите сумму" }
      const res = await real.createMarketBuy(usd)
      if (!res.success || !res.trade) return { ok: false, message: res.error || "Не удалось выполнить покупку" }
      return { ok: true, message: `Куплено ${res.trade.tcAmount} ∞ по $${res.trade.newPrice.toFixed(2)}` }
    },
    [real],
  )

  const sellTC = useCallback<StoreValue["sellTC"]>(
    async (tc) => {
      if (tc <= 0) return { ok: false, message: "Введите сумму" }
      const res = await real.createMarketSell(tc)
      if (!res.success || !res.trade) return { ok: false, message: res.error || "Не удалось выполнить продажу" }
      return { ok: true, message: `Продано ${res.trade.tcAmount} ∞ за $${res.trade.usdAmount.toFixed(2)}` }
    },
    [real],
  )

  const stakeTC = useCallback<StoreValue["stakeTC"]>(
    async (amount, days) => {
      const res = await real.stakeTC(amount, days)
      if (!res.success) return { ok: false, message: res.error || "Не удалось открыть стейк" }
      return { ok: true, message: `Застейкано ${amount} ∞ на ${days} дней` }
    },
    [real],
  )

  const unstakeTC = useCallback<StoreValue["unstakeTC"]>(
    async (id) => {
      const res = await real.unstakeTC(id)
      if (!res.success) return { ok: false, message: res.error || "Не удалось снять стейк" }
      return { ok: true, message: `Разблокировано ${res.totalReturn ?? 0} ∞ (+${res.reward ?? 0} награда)` }
    },
    [real],
  )

  const recordBurn = useCallback<StoreValue["recordBurn"]>(() => {
    /* нет отдельного бэкенд-эндпоинта — сжигание учитывается сервером
       внутри операций (маркет-сделки, премиум-усиление и т.д.) */
  }, [])

  const value = useMemo<StoreValue>(
    () => ({
      wallet,
      exchangeUp,
      addTC,
      spendTC,
      spend,
      credit,
      convert,
      netWorthTC,
      usdFor,
      tcPrice: tcPriceNum,
      priceHistory: real.priceHistory,
      tcTrades,
      tcTransactions,
      stakes,
      orderBook,
      cashUSD: real.wallet.cash_usd,
      burnedTC,
      stakedTC,
      circulatingTC,
      marketCapUSD,
      volume24hTC,
      change24h,
      changeMonth,
      buyTC,
      sellTC,
      stakeTC,
      unstakeTC,
      recordBurn,
    }),
    [
      wallet,
      exchangeUp,
      addTC,
      spendTC,
      spend,
      credit,
      convert,
      netWorthTC,
      usdFor,
      tcPriceNum,
      real.priceHistory,
      tcTrades,
      tcTransactions,
      stakes,
      orderBook,
      real.wallet.cash_usd,
      burnedTC,
      stakedTC,
      circulatingTC,
      marketCapUSD,
      volume24hTC,
      change24h,
      changeMonth,
      buyTC,
      sellTC,
      stakeTC,
      unstakeTC,
      recordBurn,
    ],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useOsgard(): StoreValue {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error("useOsgard must be used within OsgardStoreProvider")
  return ctx
}
