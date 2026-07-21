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



import { create } from "zustand"
import { apiClient, ApiError } from "@/lib/api-client"
import type { PricePoint } from "@/lib/tc-market"

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

/** Результат forgeArtifact — унифицированный ответ для UI. */
export interface ForgeActionResult {
  success: boolean
  artifact?: OsgardArtifact
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
  createdAt: number
}

/** Результат createProject/generateProject/updateProject — унифицированный ответ для UI. */
export interface ProjectActionResult {
  success: boolean
  project?: OsgardProject
  artifacts?: OsgardArtifact[]
  aiSource?: "ai" | "fallback"
  aiConfigured?: boolean
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

  /* ---- служебное состояние ---- */





  loading: boolean
  error: string | null

  /* ---- fetch-функции ---- */
  fetchWallet: () => Promise<void>
  fetchTcState: () => Promise<void>
  fetchOrderBook: () => Promise<void>
  fetchTrades: () => Promise<void>

  /* ---- работа с заявками (ШАГ 2) ---- */
  /** GET /tc-market/orders — заявки текущего пользователя. */
  fetchUserOrders: () => Promise<void>
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
  fetchStakes: () => Promise<void>
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

  /* ---- кузница артефактов ---- */
  /** GET /artifacts/mine — артефакты текущего пользователя. */
  fetchArtifacts: () => Promise<void>

  /** POST /artifacts/forge — создать новый артефакт (name, type). */
  forgeArtifact: (name: string, type: string) => Promise<ForgeActionResult>

  /** POST /artifacts/:id/premium-upgrade — премиум-усиление артефакта за TimeCoin (мгновенно, до уровня 10, 25% шанс крита). */
  premiumUpgradeArtifact: (artifactId: number) => Promise<PremiumUpgradeActionResult>

  /* ---- маркетплейс ---- */
  /** GET /marketplace/listings — список всех активных лотов на продаже. */
  fetchListings: () => Promise<void>
  /** POST /marketplace/:id/buy — купить лот по id. */
  buyListing: (listingId: number) => Promise<ForgeActionResult>

  /* ---- рейтинг архитекторов ---- */
  /** GET /leaderboard — рейтинг пользователей по доходу/продажам/уровню. */
  fetchLeaderboard: () => Promise<void>

  /* ---- история транзакций ---- */
  /** GET /transactions — история транзакций текущего пользователя. */
  fetchTransactions: () => Promise<void>

  /* ---- проекты ---- */
  /** GET /projects/mine — список проектов текущего пользователя. */
  fetchProjects: () => Promise<void>
  /** GET /projects/:id — один проект + его артефакты. */
  fetchProject: (id: number) => Promise<void>
  /** POST /projects — создать проект вручную (name, description?, badge?). */
  createProject: (name: string, description?: string, badge?: string) => Promise<ProjectActionResult>
  /** POST /projects/generate — AI-генерация проекта (name, hint?). */
  generateProject: (name: string, hint?: string) => Promise<ProjectActionResult>
  /** PATCH /projects/:id — обновить название/описание/бейдж проекта. */
  updateProject: (id: number, patch: { name?: string; description?: string; badge?: string }) => Promise<ProjectActionResult>
  /** DELETE /projects/:id — удалить проект. */
  deleteProject: (id: number) => Promise<{ success: boolean; error?: string }>
  /** Сбрасывает currentProject/currentProjectArtifacts (например, при выходе со страницы проекта). */
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
  fetchTcBalance: () => Promise<void>
  /** POST /wallet/convert-to-tc — конвертирует ∞ в TC на Solana-адрес. Проверяет баланс перед запросом. nonce — текущий nonce пользователя (защита от replay-атак). */
  convertToTc: (amount: number, solanaAddress: string, nonce?: number) => Promise<{ success: boolean; txId?: string; error?: string }>
  /** POST /wallet/convert-from-tc — принимает on-chain txSignature и зачисляет ∞. */
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

  loading: false,
  error: null,

  tcReserveBalance: null,
  tcUserBalance: null,
  tcBalanceLoading: false,
  tcBalanceError: null,






  /* ---- fetch: GET /wallet ---- */
  fetchWallet: async () => {
    try {
      const { wallet } = await apiClient.get<{ wallet: OsgardWallet }>("/wallet")
      set({ wallet, error: null })
    } catch (err) {
      set({ error: extractErrorMessage(err, "Не удалось загрузить кошелёк") })
    }
  },

  /* ---- fetch: GET /tc-market/state ---- */
  fetchTcState: async () => {
    try {
      const state = await apiClient.get<TcPriceState & { history?: PricePoint[] }>("/tc-market/state")
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
  fetchOrderBook: async () => {
    try {
      const book = await apiClient.get<OrderBookState>("/tc-market/orderbook")
      set({ orderBook: book, error: null })
    } catch (err) {
      set({ error: extractErrorMessage(err, "Не удалось загрузить стакан заявок") })
    }
  },

  /* ---- fetch: GET /tc-market/trades ---- */
  fetchTrades: async () => {
    try {
      const { trades } = await apiClient.get<{ trades: TcTrade[] }>("/tc-market/trades")
      set({ trades, error: null })
    } catch (err) {
      set({ error: extractErrorMessage(err, "Не удалось загрузить историю сделок") })
    }
  },

  /* ---- fetch: GET /tc-market/orders — заявки текущего пользователя ---- */
  fetchUserOrders: async () => {
    try {
      const { orders } = await apiClient.get<{ orders: UserOrder[] }>("/tc-market/orders")
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
  fetchStakes: async () => {
    try {
      const { stakes } = await apiClient.get<{ stakes: OsgardStake[] }>("/stakes")
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

  /* ---- fetch: GET /artifacts/mine — артефакты текущего пользователя ---- */
  fetchArtifacts: async () => {
    try {
      const { artifacts } = await apiClient.get<{ artifacts: OsgardArtifact[] }>("/artifacts/mine")
      set({ artifacts, error: null })
    } catch (err) {
      set({ error: extractErrorMessage(err, "Не удалось загрузить артефакты") })
    }
  },

  /* ---- action: POST /artifacts/forge — создать новый артефакт ---- */
  forgeArtifact: async (name, type) => {
    set({ loading: true, error: null })
    try {
      const res = await apiClient.post<{ artifact: OsgardArtifact }>("/artifacts/forge", { name, type })

      set((s) => ({
        artifacts: [res.artifact, ...s.artifacts],
        loading: false,
        error: null,
      }))

      // синхронизация с сервером после мутации
      await get().fetchWallet()

      return { success: true, artifact: res.artifact }
    } catch (err) {
      const message = extractErrorMessage(err, "Не удалось создать артефакт")
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
  fetchListings: async () => {
    try {
      const { listings } = await apiClient.get<{ listings: MarketListing[] }>("/marketplace/listings")
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
  fetchLeaderboard: async () => {
    try {
      const { leaderboard } = await apiClient.get<{ leaderboard: LeaderboardEntry[] }>("/leaderboard")
      set({ leaderboard, error: null })
    } catch (err) {
      set({ error: extractErrorMessage(err, "Не удалось загрузить рейтинг архитекторов") })
    }
  },

  /* ---- fetch: GET /transactions — история транзакций текущего пользователя ---- */
  fetchTransactions: async () => {
    try {
      const { transactions } = await apiClient.get<{ transactions: OsgardTransaction[] }>("/transactions")
      set({ transactions, error: null })
    } catch (err) {
      set({ error: extractErrorMessage(err, "Не удалось загрузить историю транзакций") })
    }
  },


  /* ---- проекты: GET /projects/mine — список проектов текущего пользователя ---- */
  fetchProjects: async () => {
    try {
      const { projects } = await apiClient.get<{ projects: OsgardProject[] }>("/projects/mine")
      set({ projects, error: null })
    } catch (err) {
      set({ error: extractErrorMessage(err, "Не удалось загрузить проекты") })
    }
  },

  /* ---- проекты: GET /projects/:id — один проект + его артефакты ---- */
  fetchProject: async (id) => {
    try {
      const res = await apiClient.get<{ project: OsgardProject; artifacts: OsgardArtifact[] }>(`/projects/${id}`)
      set({ currentProject: res.project, currentProjectArtifacts: res.artifacts, error: null })
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

  /* ---- проекты: POST /projects/generate — AI-генерация проекта ---- */
  generateProject: async (name, hint) => {
    set({ loading: true, error: null })
    try {
      const res = await apiClient.post<{
        project: OsgardProject
        artifacts: OsgardArtifact[]
        aiSource: "ai" | "fallback"
        aiConfigured: boolean
      }>("/projects/generate", { name, hint })

      set((s) => ({
        projects: [res.project, ...s.projects],
        loading: false,
        error: null,
      }))

      // синхронизация артефактов пользователя (новые артефакты проекта уже созданы на сервере)
      await get().fetchArtifacts()

      return {
        success: true,
        project: res.project,
        artifacts: res.artifacts,
        aiSource: res.aiSource,
        aiConfigured: res.aiConfigured,
      }
    } catch (err) {
      const message = extractErrorMessage(err, "Не удалось сгенерировать проект")
      set({ loading: false, error: message })
      return { success: false, error: message }
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
    set({ currentProject: null, currentProjectArtifacts: [] })
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
      loading: false,
      error: null,
    })
  },






  /* ----------------------------------------------------------------
     fetchTcBalance — GET /wallet/tc-balance
     Загружает tcReserveBalance (резерв пула) и tcUserBalance (баланс юзера)
     и сохраняет их в стор.
     ---------------------------------------------------------------- */
  fetchTcBalance: async () => {
    set({ tcBalanceLoading: true, tcBalanceError: null })
    try {
      const data = await apiClient.get<{ reserveBalance: number; userBalance: number }>("/wallet/tc-balance")
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
     convertToTc — ∞ → TC (POST /wallet/convert-to-tc)
     Проверяет баланс ∞, затем отправляет TC на Solana-адрес.
     ---------------------------------------------------------------- */
  convertToTc: async (amount: number, solanaAddress: string, nonce?: number) => {
    const { wallet } = get()
    if (wallet.timecoin < amount) {
      return { success: false, error: "Недостаточно ∞ для конвертации" }
    }
    set({ loading: true, error: null })
    try {
      const body: Record<string, unknown> = { amount, solanaAddress }
      if (nonce !== undefined) body.nonce = nonce
      const data = await apiClient.post<{ wallet: OsgardWallet; txId?: string }>("/wallet/convert-to-tc", body)
      if (data.wallet) set({ wallet: { ...get().wallet, ...data.wallet } })
      // обновляем TC-баланс после конвертации
      get().fetchTcBalance()
      return { success: true, txId: data.txId }
    } catch (err: unknown) {
      const msg = extractErrorMessage(err, "Не удалось выполнить конвертацию ∞ → TC")
      set({ error: msg })
      return { success: false, error: msg }
    } finally {
      set({ loading: false })
    }
  },

  /* ----------------------------------------------------------------
     convertFromTc — TC → ∞ (POST /wallet/convert-from-tc)
     Принимает txSignature on-chain перевода TC в резерв и зачисляет ∞.
     ---------------------------------------------------------------- */
  convertFromTc: async (txSignature: string, amount: number) => {
    set({ loading: true, error: null })
    try {
      const data = await apiClient.post<{ wallet: OsgardWallet }>("/wallet/convert-from-tc", { txSignature, amount })
      if (data.wallet) set({ wallet: { ...get().wallet, ...data.wallet } })
      // обновляем TC-баланс после конвертации
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
