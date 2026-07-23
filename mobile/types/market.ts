/** 1:1 с lib/store/osgard-store.tsx (веб) — типы рынка TimeCoin, стейков, маркетплейса, лидерборда и транзакций. */

/** Состояние рынка TimeCoin (см. GET /tc-market/state). */
export interface TcPriceState {
  price: number;
  minted: number;
  burned: number;
  staked: number;
  circulating: number;
}

/** Одна строка стакана заявок (агрегированный уровень цены). */
export interface OrderBookLevel {
  price: number;
  amount: number;
}

/** Стакан заявок (см. GET /tc-market/orderbook). */
export interface OrderBookState {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  spread: number;
  mid: number;
}

/** Сделка на рынке TimeCoin (см. GET /tc-market/trades). */
export interface TcTrade {
  id: number;
  ts: number;
  price: number;
  amount: number;
  side: 'buy' | 'sell';
  origin?: string;
}

/** Заявка пользователя (см. GET /tc-market/orders). */
export interface UserOrder {
  id: number;
  side: 'buy' | 'sell';
  price: number;
  amount: number;
  filledAmount: number;
  status: string;
  createdAt: number;
  updatedAt: number;
}

/** Результат createLimitOrder/cancelOrder — унифицированный ответ для UI. */
export interface OrderActionResult {
  success: boolean;
  error?: string;
}

/** Результат market-сделки (см. POST /tc-market/buy и /tc-market/sell). */
export interface MarketTradeInfo {
  side: 'buy' | 'sell';
  price: number;
  tcAmount: number;
  usdAmount: number;
  newPrice: number;
  orderbookAmount: number;
  emissionAmount?: number;
  burnAmount?: number;
}

/** Результат createMarketBuy/createMarketSell — унифицированный ответ для UI. */
export interface MarketActionResult {
  success: boolean;
  trade?: MarketTradeInfo;
  error?: string;
}

/** Стейк пользователя (см. stakes.routes.ts). */
export interface OsgardStake {
  id: number | string;
  amountTC: number;
  days: number;
  apr: number;
  startTs: number;
  endTs: number;
  status: 'active' | 'closed';
}

/** Результат stakeTC/unstakeTC — унифицированный ответ для UI. */
export interface StakeActionResult {
  success: boolean;
  stake?: OsgardStake;
  reward?: number;
  totalReturn?: number;
  matured?: boolean;
  error?: string;
}

/** Поддерживаемые валюты кошелька (см. wallet.routes.ts). */
export type CurrencyKey = 'credits' | 'shards' | 'crystals' | 'timecoin' | 'cash_usd';

/** Результат convertCurrency — унифицированный ответ для UI. */
export interface ConvertActionResult {
  success: boolean;
  conversion?: {
    from: CurrencyKey;
    to: CurrencyKey;
    amountSent: number;
    amountReceived: number;
    fee: number;
  };
  error?: string;
}

/** Результат lookupRecipient — предпросмотр получателя перед переводом TC. */
export interface RecipientLookupResult {
  found: boolean;
  displayName?: string;
  error?: string;
}

/** Результат transferTC — унифицированный ответ для UI. */
export interface TransferActionResult {
  success: boolean;
  transfer?: {
    recipientEmail: string;
    recipientName: string;
    amount: number;
    comment: string;
  };
  error?: string;
}

/** Лот маркетплейса (см. GET /marketplace/listings). */
export interface MarketListing {
  id: number;
  artifactId: number;
  sellerId: number;
  price: number;
  currency: string;
  status: 'active' | 'sold' | 'cancelled';
  listedAt: number;
  artifactName: string;
  artifactType: string;
  rarity: string;
  level: number;
  power: number;
  defense: number;
  magic: number;
  speed: number;
  sellerUsername: string;
  sellerDisplayName: string | null;
}

/** Запись рейтинга архитекторов (см. GET /leaderboard). */
export interface LeaderboardEntry {
  userId: number;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  level: number;
  totalIncome: number;
  totalSales: number;
  artifactCount: number;
}

/** Транзакция пользователя (см. GET /transactions). */
export interface OsgardTransaction {
  id: number;
  type: string;
  item: string | null;
  counterparty: string | null;
  amount: number;
  currency: string;
  status: string;
  createdAt: number;
}
