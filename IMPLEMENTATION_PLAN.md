# План завершения подключения фронтенда (asgard-redesign) к бэкенду

Бэкенд работает на `http://localhost:3003`. Уже созданы и НЕ требуют изменений:
- `lib/api-client.ts` — обёртка над fetch (уже написан)
- `lib/auth-store.tsx` — React Context для auth (уже написан)
- `app/login/page.tsx` — страница логина/регистрации (уже написана)
- `middleware.ts` — защита роутов (уже написан)
- `app/layout.tsx` — обновлён (обёрнут в AuthProvider, предположительно)

**Проверь их содержимое сначала (read_file), прежде чем что-то менять** — они могут уже быть полностью рабочими. Если что-то не хватает (например, AuthProvider не подключен в layout.tsx) — доделай.

Осталось: заменить моковые данные в `osgard-store.tsx` и в компонентах на реальные fetch-запросы к бэкенду через `api-client.ts`.

## Бэкенд API (порт 3003), всё уже реализовано и работает

Формат ответа api-client — обычно `{ data, error }` или напрямую JSON, проверь реализацию `lib/api-client.ts` для точного использования (вероятно есть функция `apiFetch(path, options)` или `apiClient.get/post`).

### Auth
- `POST /auth/register` `{ username, email, password }` → `{ token, user }`
- `POST /auth/login` `{ username, password }` → `{ token, user }`

### Wallet
- `GET /wallet` (auth) → `{ wallet: { credits, shards, crystals, timecoin, cash_usd, updatedAt } }`
- `POST /wallet/convert` (auth) `{ from, to, amount }` → `{ wallet, conversion: { from, to, amountSent, amountReceived, fee } }`
  - Валюты: `credits | shards | crystals | timecoin | cash_usd`

### TC Market (TimeCoin биржа)
- `GET /tc-market/state` (public) → `{ price, minted, burned, staked, circulating, marketCap, volume24h, history: [{ts, price}] }`
- `POST /tc-market/buy` (auth) `{ usdAmount }` → `{ wallet, trade: { side, price, tcAmount, usdAmount, newPrice } }`
- `POST /tc-market/sell` (auth) `{ tcAmount }` → `{ wallet, trade: { side, price, tcAmount, usdAmount, newPrice } }`

### Stakes (стейкинг)
- `GET /stakes` (auth) → `{ stakes: [{ id, amountTc, days, apr, marketFee, startTs, endTs, status }] }`
- `POST /stakes` (auth) `{ amount, days }` → `{ stake }` (status 201)
- `POST /stakes/:id/unstake` (auth) → `{ stake, reward, totalReturn, matured }`

### Artifacts (артефакты / кузница)
- `GET /artifacts/mine` (auth) → `{ artifacts: [{ id, projectId, name, type, rarity, level, power, defense, magic, speed, status, views24h, supply, price, listCurrency, createdAt }] }`
- `POST /artifacts/forge` (auth) `{ name, type, projectId? }` → `{ artifact }` (status 201). Стоимость: 50 TimeCoin, статы генерируются сервером случайно.
- `POST /artifacts/:id/evolve` (auth) → `{ artifact, rankUp }`

### Marketplace
- `GET /marketplace/listings` (public) → `{ listings: [{ id, artifactId, sellerId, price, currency, status, listedAt, artifactName, artifactType, rarity, level, power, defense, magic, speed, sellerUsername, sellerDisplayName }] }`
- `POST /marketplace/list` (auth) `{ artifactId, price, currency }` → `{ listing }` (status 201)
- `POST /marketplace/:id/buy` (auth) → `{ wallet, purchased, price, currency }`

### Hall of Fame
- `GET /hall-of-fame?limit=50` (public) → `{ hallOfFame: [{ id, artifactId, artifactName, type, rarity, architect, price, achievedAt }] }`

### Leaderboard
- `GET /leaderboard?limit=50` (public) → `{ leaderboard: [{ userId, username, displayName, avatarUrl, level, totalIncome, totalSales, artifactCount }] }`

### Transactions
- `GET /transactions?limit=100` (auth) → `{ transactions: [{ id, type, item, counterparty, amount, currency, status, createdAt }] }`

### Projects
- Пока только заглушка `GET /projects/_placeholder` → `{ ok: true }`. Реальных данных о проектах на бэкенде нет — используемые в `forge-view.tsx` / `projects-view.tsx` моковые `PROJECTS` из `lib/economy.ts` пока можно оставить как есть (бэкенд для них не готов), либо оставить TODO.

## Важно про демо-пользователя
В БД есть seed пользователь `alex_odin` / пароль `password123` с балансом и артефактами — можно использовать для тестового входа.

---

## Что нужно сделать по каждому файлу

### 1. `lib/osgard-store.tsx` — главный файл для переделки

Нужно найти текущую реализацию (`read_file lib/osgard-store.tsx` в начале работы — этот файл ещё не был прочитан в этой сессии, ОБЯЗАТЕЛЬНО прочитать его первым делом).

Структура контекста (сохранить такую же сигнатуру `useOsgard()`, чтобы компоненты не пришлось сильно менять):
```ts
type OsgardState = {
  wallet: { credits: number; shards: number; crystals: number; timecoin: number; cash_usd: number; updatedAt?: number }
  stakes: Array<{ id: number; amountTc: number; days: number; apr: number; marketFee: number; startTs: number; endTs: number; status: string }>
  tcPrice: number
  stakedTC: number // state.staked из tc-market/state
  loading: boolean
  // actions:
  refreshWallet: () => Promise<void>
  convert: (amount: number, from: CurrencyId, to: CurrencyId) => Promise<{ ok: boolean; message: string }>
  usdFor: (tcAmount: number) => number // tcAmount * tcPrice
  stakeTC: (amount: number, days: number) => Promise<{ ok: boolean; message: string }>
  unstakeTC: (id: number) => Promise<{ ok: boolean; message: string }>
  buyTC: (usdAmount: number) => Promise<{ ok: boolean; message: string }>
  sellTC: (tcAmount: number) => Promise<{ ok: boolean; message: string }>
  spend: (currency: CurrencyId, amount: number) => void // deprecated мок, оставить как no-op либо связать с wallet.convert для обратной совместимости в exchange-view (см. ниже)
  credit: (currency: CurrencyId, amount: number) => void // deprecated мок
}
```
Реализация:
- При монтировании Provider — `useEffect` вызывает `GET /wallet`, `GET /stakes`, `GET /tc-market/state` (если есть токен через `getToken()` из `auth-store`), сохраняет в state.
- `tcPrice` берём из `/tc-market/state`.price, `stakedTC` из `.staked`.
- `convert()` → `POST /wallet/convert`, при успехе обновить `wallet` из ответа, вернуть `{ ok: true, message: ... }`, при ошибке — `{ ok: false, message: error.message }`.
- `stakeTC()` → `POST /stakes`, после успеха — `refreshStakes()` + `refreshWallet()`.
- `unstakeTC(id)` → `POST /stakes/:id/unstake`, обновить список стейков + wallet.
- `buyTC`/`sellTC` → `POST /tc-market/buy` / `/sell`, обновить wallet + tcPrice (из `trade.newPrice`).
- Используй `api-client.ts` для всех запросов (там должна быть логика подстановки токена и обработки 401).
- Оберни все вызовы в try/catch, возвращай `{ ok: false, message }` при ошибке (ошибка обычно приходит как `{ error: "текст" }` от бэкенда).

### 2. `components/wallet-view.tsx`
Уже использует `useOsgard()` → `wallet`, `convert`, `usdFor`, `tcPrice`. Если `osgard-store.tsx` реализован по плану выше — **этот компонент менять не нужно**, он автоматически заработает на реальных данных. Проверить только сигнатуру `convert` (используется как `convert(n, from, to)` синхронно, возвращает `{ok, message}` — если станет `Promise`, нужно обновить `doConvert()` на `async/await`).

### 3. `components/stake-view.tsx`
Использует `wallet`, `stakes`, `stakeTC`, `unstakeTC`, `tcPrice`, `stakedTC` из `useOsgard()`. Стейки сейчас имеют поле `s.amountTC`, `s.endTs`, `s.days`, `s.apr` — на бэкенде поле называется `amountTc` (маленькая `c`). Нужно:
  - Либо в `osgard-store.tsx` при мапинге переименовать `amountTc` → `amountTC` для сохранения совместимости с этим компонентом,
  - Либо поправить `stake-view.tsx`, заменив `s.amountTC` на `s.amountTc` везде (2 места: строки ~31, ~203).
  Рекомендация: **переименовать в store при мапинге** (проще, меньше правок в UI).
  Также `doStake()` вызывает `stakeTC(amt, term.days)` синхронно — если функция асинхронная, обернуть в `async` и делать `await`.

### 4. `components/forge-view.tsx`
Сейчас полностью локальный мок (генерация статов на клиенте случайным образом, "создание" не сохраняется). Нужно:
  - Убрать локальную генерацию статов (`rollStats`, `rollRarity`) для реального запроса — но т.к. дизайн показывает preview статов ДО создания, а бэкенд генерирует статы на сервере — оставь текущий preview как "предпросмотр ожидания" (statы всё равно случайны), но при нажатии "Создать" делать реальный запрос:
    ```ts
    async function handleCreate() {
      const res = await apiClient.post('/artifacts/forge', { name: name || 'Безымянный артефакт', type, projectId: project.id })
      // res.artifact — реальный артефакт с сервера (со своими статами/редкостью)
      setCreatedArtifact(res.artifact)
      setCreated(true)
    }
    ```
  - Заменить `onClick={() => setCreated(true)}` на `onClick={handleCreate}`.
  - `CreatedModal` должен показывать статы `createdArtifact` (реальные с сервера), а не локальный `stats`/`rarity` state.
  - Добавить обработку ошибок (недостаточно TimeCoin и т.д.) — показать `notice`/`toast`.

### 5. `components/artifacts-view.tsx`
Сейчас `ARTIFACTS` статический мок из `lib/economy.ts`, фильтруется по `a.architect === "Alex Odin"`. Нужно:
  - Заменить на `useEffect` + `useState` загрузку через `GET /artifacts/mine` (auth).
  - Поля с бэкенда: `id, name, type, rarity, level, power, defense, magic, speed, status, views24h, supply, price, listCurrency, createdAt`. UI использует `a.stats[s.key]` (`STAT_META` ключи `power/defense/magic/speed`) — нужно смаппить `{ power, defense, magic, speed }` в `stats: { power, defense, magic, speed }` объект при загрузке, либо поправить `ArtifactCard`, чтобы брать `a.power` напрямую (быстрее). Рекомендация: при получении данных с бэкенда сразу преобразовать в форму, ожидаемую компонентом:
    ```ts
    const mapped = artifacts.map(a => ({
      ...a,
      stats: { power: a.power, defense: a.defense, magic: a.magic, speed: a.speed },
      architect: "Alex Odin", // текущий пользователь
    }))
    ```
  - Убрать импорт `ARTIFACTS` из `lib/economy`, использовать загруженные данные.
  - Добавить простое состояние loading/error.

### 6. `components/exchange-view.tsx`
Два режима: `tc` (реальный TC-маркет — компонент `TCMarketPanel`, см. ниже) и `artifacts` (order book/candles — ПОЛНОСТЬЮ мок на `genCandles/genOrderBook/genTrades`, бэкенд для трейдинга артефактов не предоставляет API). 
  - Режим `artifacts`: оставить как есть (нет соответствующего бэкенд-функционала кроме marketplace list/buy — это другой функционал). Можно оставить мок без изменений, т.к. в задаче явно указан только `GET /tc-market/state`, `POST /tc-market/buy`, `POST /tc-market/sell` — они используются в `TCMarketPanel`, не в этом файле напрямую.
  - Проверь `components/tc-market-panel.tsx` (ещё не прочитан!) — это отдельный компонент, где, вероятно, используется `useOsgard()` для tcPrice/history и должны быть кнопки Buy/Sell, вызывающие `buyTC`/`sellTC` из store. **Прочитай его первым делом** и подключи к реальным `tcPrice`, `history` (из `/tc-market/state`) и `buyTC`/`sellTC` экшенам.
  - `wallet-based spend/credit` в `exchange-view.tsx` (строка ~80, ~117-127) используются только для арт-биржи (мок) — их можно оставить как локальные мутации мок-баланса или no-op, т.к. эта часть не входит в требуемый бэкенд-функционал. Если `osgard-store` больше не экспортирует `spend`/`credit`, либо оставить их как заглушки в сторе (`spend/credit` не влияют на реальный кошелёк, показываем note "демо режим"), либо просто убрать использование в этом файле (сложнее). Рекомендация: оставить `spend`/`credit` как простые no-op функции в сторе для обратной совместимости (не критично для ТЗ).

### 7. `components/marketplace-view.tsx` (найти и прочитать — не читался в этой сессии)
  - `GET /marketplace/listings` (публичный) → список лотов.
  - `POST /marketplace/list` `{ artifactId, price, currency }` — выставление своего артефакта (нужно предварительно получить `artifacts/mine` со статусом `kept` для выбора, если в UI есть такая форма).
  - `POST /marketplace/:id/buy` — покупка лота, обновляет wallet через `refreshWallet()` из store.
  - Заменить моковые данные (вероятно `MARKETPLACE_LISTINGS` из `lib/economy.ts`) на fetch.

### 8. `components/hall-of-fame-view.tsx` (прочитать — не читался)
  - `GET /hall-of-fame` (публичный, без токена нужен) → заменить моковые данные.

### 9. `components/leaderboard-view.tsx` (прочитать — не читался)
  - `GET /leaderboard` (публичный) → заменить моковые данные.

### 10. `components/transactions-view.tsx` (прочитать — не читался)
  - `GET /transactions` (auth) → заменить моковые данные.

---

## Общий паттерн для GET-компонентов (пример для marketplace/hall-of-fame/leaderboard/transactions)

```tsx
"use client"
import { useEffect, useState } from "react"
import { apiClient } from "@/lib/api-client" // либо то имя экспорта, что реально в файле — ПРОВЕРИТЬ

export function SomeView() {
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setLoading(true)
        const res = await apiClient.get("/hall-of-fame") // путь без базового URL
        if (!cancelled) setData(res.hallOfFame)
      } catch (e: any) {
        if (!cancelled) setError(e.message || "Ошибка загрузки")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  // остальной JSX без изменений, только источник данных — `data` вместо мока
}
```

**ВАЖНО**: перед началом работы прочитать `lib/api-client.ts`, чтобы узнать точное имя экспортируемой функции/объекта и сигнатуру (GET/POST), и использовать её единообразно во всех местах.

---

## Порядок выполнения (рекомендуемый)

1. Прочитать и при необходимости доработать (проверить, что уже готово):
   - `lib/api-client.ts`
   - `lib/auth-store.tsx`
   - `app/login/page.tsx`
   - `middleware.ts`
   - `app/layout.tsx` (AuthProvider подключен?)
2. Прочитать `lib/osgard-store.tsx` (текущая мок-реализация) и `lib/economy.ts`, `lib/tc-market.ts` (типы/утилиты, используемые компонентами) — чтобы не сломать типы.
3. Переписать `lib/osgard-store.tsx` на реальные fetch-запросы (см. раздел 1).
4. Прочитать и подключить `components/tc-market-panel.tsx` к реальным данным.
5. Проверить/поправить `wallet-view.tsx` (скорее всего без изменений).
6. Поправить `stake-view.tsx` (поля amountTc/async).
7. Переписать `forge-view.tsx` (реальный POST /artifacts/forge).
8. Переписать `artifacts-view.tsx` (реальный GET /artifacts/mine).
9. Прочитать и переписать `marketplace-view.tsx`.
10. Прочитать и переписать `hall-of-fame-view.tsx`.
11. Прочитать и переписать `leaderboard-view.tsx`.
12. Прочитать и переписать `transactions-view.tsx`.
13. Прогнать `npm run build` / `npm run dev` в `asgard-redesign`, убедиться, что нет TS-ошибок.
14. Проверить вручную: логин demo-пользователем `alex_odin`/`password123`, переход по /wallet, /stake, /forge, /artifacts, /marketplace, /hall-of-fame, /leaderboard, /transactions.

## Не трогать
- Стили, JSX-разметку, CSS — только источники данных и обработчики действий.
- `lib/economy.ts` типы (CurrencyId, Rarity, ArtifactType и т.д.) — использовать их же для типизации замапленных данных с бэкенда.
- Раздел "Артефакты-биржа" (order book/candles) в `exchange-view.tsx` — бэкенд для него не предоставлен, оставить мок как есть.
- Проекты (`projects-view.tsx`, `PROJECTS` из economy.ts) — бэкенд не готов (только placeholder route), можно оставить моки с пометкой TODO в комментарии.
