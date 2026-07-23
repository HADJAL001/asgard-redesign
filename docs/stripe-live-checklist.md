# Чек-лист включения боевого Stripe

Статус кода: аудит завершён, все найденные баги исправлены, интеграционные тесты
(`backend/src/tests/stripe-billing-mock.test.ts`, `stripe-billing-webhook.test.ts`)
проходят. Ниже — что нужно сделать координатору, чтобы переключить приём платежей
с mock/test-режима на боевой.

## 1. Получить ключи в панели Stripe (боевой режим, не test)

Stripe Dashboard → Developers → API keys (переключатель "Test mode" выключен):

- `STRIPE_SECRET_KEY` — секретный ключ вида `sk_live_...`

Stripe Dashboard → Developers → Webhooks → Add endpoint. **У нас два независимых
webhook-эндпоинта, каждому Stripe выдаёт свой отдельный секрет** — это не опечатка,
так самим Stripe устроено, если endpoint-ов два:

- Endpoint `https://<домен>/subscription/webhook` → события
  `checkout.session.completed`, `customer.subscription.updated/deleted`,
  `invoice.payment_failed` → секрет пойдёт в `STRIPE_WEBHOOK_SECRET`
- Endpoint `https://<домен>/addons/webhook` → события покупки ДЖАРВИС/ВАЛЛИ Premium →
  секрет пойдёт в `STRIPE_WEBHOOK_SECRET_ADDONS`

Если `STRIPE_WEBHOOK_SECRET_ADDONS` не задать, код фолбэкнется на
`STRIPE_WEBHOOK_SECRET` — это сработает только если по ошибке настроить оба
webhook-а на один секрет, что Stripe не позволяет для двух разных зарегистрированных
endpoint-ов. Поэтому оба секрета нужно получить и вставить отдельно.

## 2. Создать боевые Product/Price в Stripe Billing

Stripe Dashboard → Product catalog (боевой режим) → создать по одному Product на
каждый тариф с recurring-ценой (Stripe Billing сам обслуживает продление,
код на нашей стороне ничего дополнительно не запускает — see `lib/stripe.ts`):

- Pro → `STRIPE_PRICE_PRO`
- Supreme → `STRIPE_PRICE_SUPREME`
- Duo → `STRIPE_PRICE_DUO`
- Elite → `STRIPE_PRICE_ELITE`
- ДЖАРВИС Premium (addon) → `STRIPE_PRICE_JARVIS_PREMIUM`
- ВАЛЛИ Premium (addon) → `STRIPE_PRICE_WALLI_PREMIUM`

Важно: Price ID из test-режима и live-режима — это разные объекты в Stripe, старые
`price_...` из sandbox не будут работать в боевом режиме, нужно создавать заново.

## 3. Вставить ключи в env боевого окружения

В `backend/.env` (или в переменные окружения хостинга — не коммитить в git):

```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...        # из /subscription/webhook
STRIPE_WEBHOOK_SECRET_ADDONS=whsec_... # из /addons/webhook, ОТДЕЛЬНЫЙ секрет
STRIPE_PRICE_PRO=price_...
STRIPE_PRICE_SUPREME=price_...
STRIPE_PRICE_DUO=price_...
STRIPE_PRICE_ELITE=price_...
STRIPE_PRICE_JARVIS_PREMIUM=price_...
STRIPE_PRICE_WALLI_PREMIUM=price_...
```

Менять код не нужно — `lib/stripe.ts` уже читает эти переменные и при пустом
`STRIPE_SECRET_KEY` в `NODE_ENV=production` жёстко блокирует запуск (защита от
случайного запуска боевого сервера без ключей), а в dev — уходит в mock-режим.

## 4. Протестировать в sandbox перед переключением (test-режим)

Пока используются `sk_test_...` / `price_...` из test-каталога:

1. Полный цикл: клик "Оформить подписку" → Stripe Checkout → оплата тестовой картой
   → редирект на success_url → webhook `checkout.session.completed` →
   `subscriptions.status = active`, `plan` проставлен.
2. Тестовые карты Stripe (test mode):
   - `4242 4242 4242 4242` — успешная оплата
   - `4000 0000 0000 9995` — отказ карты (insufficient funds) → проверить, что
     `invoice.payment_failed` обрабатывается и пользователь не остаётся в
     "подвешенном" активном статусе
   - `4000 0000 0000 0341` — карта, которая пройдёт первый чардж, но откажет при
     попытке списания в следующем цикле (для проверки реального продления)
   - Любой CVC из 3 цифр, будущая дата истечения
3. Смена тарифа (upgrade/downgrade) через эндпоинт с proration — проверить, что
   Stripe создаёт proration-инвойс и `subscriptions.plan` обновляется по webhook,
   а не оптимистично на клиенте.
4. Отмена подписки — проверить `cancel_at_period_end`, что доступ сохраняется до
   конца оплаченного периода, а `canceled_at` проставляется по
   `customer.subscription.deleted`.
5. Webhook signature — прогнать `stripe listen --forward-to
   localhost:<port>/subscription/webhook` (и отдельно `/addons/webhook`) через
   Stripe CLI, чтобы убедиться, что боевой сервер настроен на приём реальных
   Stripe-запросов, а не только на mock/тестовые вызовы из наших интеграционных
   тестов.

## 5. Включить боевой режим

1. Обновить `STRIPE_SECRET_KEY` и оба `STRIPE_WEBHOOK_SECRET*` на live-значения
   (шаги 1 и 3 выше).
2. Убедиться, что `NODE_ENV=production` на боевом сервере (иначе mock-режим
   заблокирован намеренно, но лучше не полагаться на дефолт).
3. Задеплоить и сделать один реальный тестовый платёж на небольшую сумму своей
   картой, проверить в `/admin/billing` (дашборд платежей), что транзакция и
   подписка отразились.
4. Проверить в Stripe Dashboard → Webhooks, что оба endpoint-а получают события
   с кодом 200 (не 400/401 — признак неверного secret).

## Обработка крайних случаев (уже реализовано в коде)

- **Отмена подписки** — доступ не отзывается мгновенно: `cancel_at_period_end`,
  доступ сохраняется до `current_period_end`, история транзакций не удаляется
  (таблица `transactions` не трогается при отмене).
- **Смена тарифа** — через Stripe proration (эндпоинт upgrade/downgrade), сумма
  пересчитывается пропорционально остатку периода самим Stripe, наша БД
  обновляется по факту webhook-события, а не оптимистично.
- **Отказ в оплате** (`invoice.payment_failed`) — пользователь уведомляется,
  подписка не активируется/не продлевается на новый период; при повторных
  неудачах Stripe Billing сам управляет retry-логикой и итоговой отменой
  согласно настройкам Dashboard → Billing → Subscriptions and emails.

## Дашборд платежей

`/admin/billing` (только для `role = admin`): общая выручка, выручка по типу
(подписки/докупки), активные подписки по тарифам, churn rate за 30 дней,
количество отклонённых платежей за 30 дней, последние 50 транзакций, экспорт
полного списка в CSV (`/api/billing-dashboard/export.csv`).
