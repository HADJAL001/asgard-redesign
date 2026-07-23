/* ================================================================
   OSGARD · Service Bridge — реестр коннекторов
   ----------------------------------------------------------------
   Статический каталог поддерживаемых внешних сервисов (MVP-фаза 1):
   Stripe, Telegram, Slack, Discord, SendGrid, GitHub, Notion и
   произвольный REST API. Каждый коннектор описывает поля подключения
   (какие из них секретные — шифруются) и доступные действия (метод +
   путь относительно baseUrl, плейсхолдеры {{param}} подставляются
   движком перед запросом).

   Здесь нет клиентского SDK каждого сервиса — все вызовы идут через
   один универсальный HTTP-движок (service-bridge-engine.ts), поэтому
   добавление нового коннектора не требует новых зависимостей.
   ================================================================ */

export interface ConnectorField {
  key: string
  label: string
  type: "text" | "password"
  secret?: boolean
  required?: boolean
  placeholder?: string
}

export interface ConnectorActionParam {
  key: string
  label: string
  in: "query" | "body" | "path"
  required?: boolean
}

export interface ConnectorAction {
  id: string
  label: string
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  path: string
  description?: string
  params?: ConnectorActionParam[]
  isTestAction?: boolean
}

export type ConnectorAuthType = "bearer" | "basic" | "header" | "query" | "none"

export interface ConnectorDefinition {
  id: string
  name: string
  category: string
  description: string
  icon: string
  /** Пусто для коннекторов с пользовательским baseUrl (custom_rest). */
  baseUrl: string
  /** true, если baseUrl задаёт сам пользователь в config.baseUrl (требует SSRF-проверки). */
  customBaseUrl?: boolean
  authType: ConnectorAuthType
  authHeaderName?: string
  authQueryParam?: string
  fields: ConnectorField[]
  actions: ConnectorAction[]
}

const API_KEY_FIELD: ConnectorField = {
  key: "apiKey",
  label: "API-ключ",
  type: "password",
  secret: true,
  required: true,
}

export const CONNECTORS: ConnectorDefinition[] = [
  {
    id: "stripe",
    name: "Stripe",
    category: "payments",
    description: "Платежи и подписки — создание платежей, клиентов, списки транзакций.",
    icon: "credit-card",
    baseUrl: "https://api.stripe.com/v1",
    authType: "bearer",
    fields: [{ ...API_KEY_FIELD, label: "Secret key (sk_...)" }],
    actions: [
      { id: "list_charges", label: "Список платежей", method: "GET", path: "/charges", isTestAction: true, params: [{ key: "limit", label: "Лимит", in: "query" }] },
      {
        id: "create_payment_intent",
        label: "Создать платёж (Payment Intent)",
        method: "POST",
        path: "/payment_intents",
        params: [
          { key: "amount", label: "Сумма (в минимальных единицах)", in: "body", required: true },
          { key: "currency", label: "Валюта (usd, eur...)", in: "body", required: true },
        ],
      },
      { id: "list_customers", label: "Список клиентов", method: "GET", path: "/customers", params: [{ key: "limit", label: "Лимит", in: "query" }] },
    ],
  },
  {
    id: "telegram",
    name: "Telegram Bot",
    category: "messengers",
    description: "Отправка сообщений и файлов через Telegram Bot API.",
    icon: "send",
    baseUrl: "https://api.telegram.org/bot{{botToken}}",
    authType: "none",
    fields: [{ key: "botToken", label: "Bot Token", type: "password", secret: true, required: true }],
    actions: [
      { id: "get_me", label: "Проверить бота (getMe)", method: "GET", path: "/getMe", isTestAction: true },
      {
        id: "send_message",
        label: "Отправить сообщение",
        method: "POST",
        path: "/sendMessage",
        params: [
          { key: "chat_id", label: "Chat ID", in: "body", required: true },
          { key: "text", label: "Текст", in: "body", required: true },
        ],
      },
    ],
  },
  {
    id: "slack",
    name: "Slack",
    category: "messengers",
    description: "Отправка сообщений в каналы Slack через Incoming/Bot API.",
    icon: "message-square",
    baseUrl: "https://slack.com/api",
    authType: "bearer",
    fields: [{ ...API_KEY_FIELD, label: "Bot User OAuth Token (xoxb-...)" }],
    actions: [
      { id: "auth_test", label: "Проверить токен (auth.test)", method: "POST", path: "/auth.test", isTestAction: true },
      {
        id: "post_message",
        label: "Отправить сообщение",
        method: "POST",
        path: "/chat.postMessage",
        params: [
          { key: "channel", label: "Канал (#general или ID)", in: "body", required: true },
          { key: "text", label: "Текст", in: "body", required: true },
        ],
      },
    ],
  },
  {
    id: "discord",
    name: "Discord Webhook",
    category: "messengers",
    description: "Отправка сообщений в канал Discord через webhook.",
    icon: "message-circle",
    baseUrl: "https://discord.com/api/webhooks/{{webhookId}}/{{webhookToken}}",
    customBaseUrl: false,
    authType: "none",
    fields: [
      { key: "webhookId", label: "Webhook ID", type: "text", required: true },
      { key: "webhookToken", label: "Webhook Token", type: "password", secret: true, required: true },
    ],
    actions: [
      {
        id: "send_message",
        label: "Отправить сообщение",
        method: "POST",
        path: "",
        isTestAction: true,
        params: [{ key: "content", label: "Текст сообщения", in: "body", required: true }],
      },
    ],
  },
  {
    id: "sendgrid",
    name: "SendGrid",
    category: "email",
    description: "Отправка email через SendGrid API.",
    icon: "mail",
    baseUrl: "https://api.sendgrid.com/v3",
    authType: "bearer",
    fields: [{ ...API_KEY_FIELD, label: "API Key (SG....)" }],
    actions: [
      { id: "list_scopes", label: "Проверить ключ (scopes)", method: "GET", path: "/scopes", isTestAction: true },
      {
        id: "send_mail",
        label: "Отправить письмо",
        method: "POST",
        path: "/mail/send",
        params: [
          { key: "to", label: "Кому (email)", in: "body", required: true },
          { key: "from", label: "От кого (email)", in: "body", required: true },
          { key: "subject", label: "Тема", in: "body", required: true },
          { key: "text", label: "Текст письма", in: "body", required: true },
        ],
      },
    ],
  },
  {
    id: "github",
    name: "GitHub",
    category: "dev",
    description: "Работа с репозиториями, issues и файлами через GitHub REST API.",
    icon: "github",
    baseUrl: "https://api.github.com",
    authType: "bearer",
    fields: [{ ...API_KEY_FIELD, label: "Personal Access Token" }],
    actions: [
      { id: "get_user", label: "Проверить токен (текущий пользователь)", method: "GET", path: "/user", isTestAction: true },
      {
        id: "create_issue",
        label: "Создать issue",
        method: "POST",
        path: "/repos/{{owner}}/{{repo}}/issues",
        params: [
          { key: "owner", label: "Владелец репозитория", in: "path", required: true },
          { key: "repo", label: "Репозиторий", in: "path", required: true },
          { key: "title", label: "Заголовок", in: "body", required: true },
          { key: "body", label: "Описание", in: "body" },
        ],
      },
    ],
  },
  {
    id: "notion",
    name: "Notion",
    category: "productivity",
    description: "Создание страниц и запись в базы данных Notion.",
    icon: "book",
    baseUrl: "https://api.notion.com/v1",
    authType: "bearer",
    fields: [{ ...API_KEY_FIELD, label: "Internal Integration Secret" }],
    actions: [
      { id: "get_bot_user", label: "Проверить токен (users/me)", method: "GET", path: "/users/me", isTestAction: true },
      {
        id: "query_database",
        label: "Запрос к базе данных",
        method: "POST",
        path: "/databases/{{databaseId}}/query",
        params: [{ key: "databaseId", label: "ID базы данных", in: "path", required: true }],
      },
    ],
  },
  {
    id: "custom_rest",
    name: "Свой REST API",
    category: "custom",
    description: "Произвольный HTTP REST API с указанием собственного адреса и авторизации.",
    icon: "plug",
    baseUrl: "",
    customBaseUrl: true,
    authType: "header",
    authHeaderName: "Authorization",
    fields: [
      { key: "baseUrl", label: "Базовый URL (https://...)", type: "text", required: true },
      { key: "authHeaderValue", label: "Значение заголовка авторизации", type: "password", secret: true },
    ],
    actions: [
      {
        id: "get",
        label: "GET-запрос",
        method: "GET",
        path: "/{{path}}",
        isTestAction: true,
        params: [{ key: "path", label: "Путь (относительно базового URL)", in: "path" }],
      },
      {
        id: "post",
        label: "POST-запрос",
        method: "POST",
        path: "/{{path}}",
        params: [
          { key: "path", label: "Путь (относительно базового URL)", in: "path" },
          { key: "body", label: "Тело запроса (JSON)", in: "body" },
        ],
      },
    ],
  },
]

export function getConnector(id: string): ConnectorDefinition | undefined {
  return CONNECTORS.find((c) => c.id === id)
}

export function getConnectorAction(connector: ConnectorDefinition, actionId: string): ConnectorAction | undefined {
  return connector.actions.find((a) => a.id === actionId)
}

/** Публичный (без секретов) список коннекторов для фронтенда — Service Hub. */
export function listConnectorsPublic() {
  return CONNECTORS.map((c) => ({
    id: c.id,
    name: c.name,
    category: c.category,
    description: c.description,
    icon: c.icon,
    fields: c.fields.map((f) => ({ key: f.key, label: f.label, type: f.type, secret: !!f.secret, required: !!f.required, placeholder: f.placeholder })),
    actions: c.actions.map((a) => ({ id: a.id, label: a.label, method: a.method, description: a.description, params: a.params ?? [], isTestAction: !!a.isTestAction })),
  }))
}
