import type { ConnectorAction, ConnectorDefinition } from "./connector-registry"

/* ================================================================
   OSGARD · Service Bridge — генератор кода
   ----------------------------------------------------------------
   Чистая функция без выполнения: превращает описание действия
   коннектора в готовый TypeScript-сниппет на fetch(), который
   пользователь может скопировать в свой проект. Значения полей
   конфига подставляются как плейсхолдеры — реальные секреты никогда
   не попадают в сгенерированный код.
   ================================================================ */

function authSnippet(connector: ConnectorDefinition): string {
  if (connector.authType === "bearer") {
    return `    Authorization: \`Bearer \${process.env.${envVarName(connector, "apiKey")}}\`,\n`
  }
  if (connector.authType === "header" && connector.authHeaderName) {
    return `    "${connector.authHeaderName}": process.env.${envVarName(connector, "authHeaderValue")},\n`
  }
  return ""
}

function envVarName(connector: ConnectorDefinition, fieldKey: string): string {
  return `${connector.id.toUpperCase()}_${fieldKey.toUpperCase()}`
}

export function generateActionSnippet(connector: ConnectorDefinition, action: ConnectorAction): string {
  const baseUrl = connector.customBaseUrl ? "process.env.CUSTOM_REST_BASE_URL" : `"${connector.baseUrl}"`
  const pathParams = (action.params ?? []).filter((p) => p.in === "path")
  const queryParams = (action.params ?? []).filter((p) => p.in === "query")
  const bodyParams = (action.params ?? []).filter((p) => p.in === "body")

  let path = action.path
  for (const p of pathParams) {
    path = path.replace(new RegExp(`\\{\\{\\s*${p.key}\\s*\\}\\}`, "g"), `\${${p.key}}`)
  }

  const queryLine =
    queryParams.length > 0
      ? `\n  const query = new URLSearchParams({ ${queryParams.map((p) => `${p.key}: String(${p.key} ?? "")`).join(", ")} })`
      : ""
  const urlLine = queryParams.length > 0 ? `\`\${${baseUrl}}${path}?\${query}\`` : `\`\${${baseUrl}}${path}\``

  const bodyLine =
    bodyParams.length > 0
      ? `\n  body: JSON.stringify({ ${bodyParams.map((p) => p.key).join(", ")} }),`
      : ""

  const params = [...pathParams, ...queryParams, ...bodyParams].map((p) => p.key)
  const fnArgs = params.length > 0 ? `{ ${params.join(", ")} }: { ${params.map((k) => `${k}: string`).join("; ")} }` : ""

  return `// ${connector.name} — ${action.label}
// Секреты подставляются из переменных окружения — впишите свои значения перед запуском.
async function call${capitalize(connector.id)}${capitalize(action.id)}(${fnArgs}) {${queryLine}
  const response = await fetch(${urlLine}, {
    method: "${action.method}",
    headers: {
      "Content-Type": "application/json",
${authSnippet(connector)}    },${bodyLine}
  })

  if (!response.ok) {
    throw new Error(\`${connector.name} API error: \${response.status}\`)
  }

  return response.json()
}
`
}

function capitalize(str: string): string {
  return str.replace(/(^|_)([a-z])/g, (_m, _sep, c) => c.toUpperCase())
}
