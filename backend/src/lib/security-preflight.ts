/* ================================================================
   OSGARD · Security preflight — проверка критичных секретов на старте
   ----------------------------------------------------------------
   В коде исторически заданы небезопасные дефолты:
     JWT_SECRET            || 'default_secret'
     JWT_REFRESH_SECRET    || 'default_refresh_secret'
     ENCRYPTION_KEY        || 'default-32-char-key-for-aes'
   Если такой дефолт уедет в прод — злоумышленник сможет подделывать JWT
   и расшифровать поля (email, 2FA-секреты) при утечке БД.

   Эта проверка в ПРОДЕ (NODE_ENV=production) отказывается стартовать,
   если секрет не задан, совпадает с дефолтом или слишком короткий.
   В dev/test — только предупреждение, чтобы не мешать локальной работе.

   Значения секретов НИКОГДА не логируются — только имена переменных.
   ================================================================ */

const KNOWN_DEFAULTS: Record<string, string> = {
  JWT_SECRET: "default_secret",
  JWT_REFRESH_SECRET: "default_refresh_secret",
  ENCRYPTION_KEY: "default-32-char-key-for-aes",
}

const MIN_LENGTH: Record<string, number> = {
  JWT_SECRET: 16,
  JWT_REFRESH_SECRET: 16,
  ENCRYPTION_KEY: 16,
}

export function collectProblems(): string[] {
  const problems: string[] = []
  for (const name of Object.keys(KNOWN_DEFAULTS)) {
    const value = process.env[name]
    if (!value || value.trim() === "") {
      problems.push(`${name}: не задан`)
    } else if (value === KNOWN_DEFAULTS[name]) {
      problems.push(`${name}: используется небезопасный дефолт`)
    } else if (value.length < MIN_LENGTH[name]) {
      problems.push(`${name}: слишком короткий (мин. ${MIN_LENGTH[name]} символов)`)
    }
  }
  return problems
}

/** Проверяет критичные секреты. В проде — падает (exit 1) при проблемах,
 *  в dev/test — предупреждает и продолжает. */
export function assertProductionSecrets(): void {
  const problems = collectProblems()
  if (problems.length === 0) return

  const isProd = process.env.NODE_ENV === "production"
  const header = isProd
    ? "[security-preflight] ОТКАЗ ЗАПУСКА — небезопасная конфигурация секретов:"
    : "[security-preflight] предупреждение (в проде это заблокирует запуск):"

  console.error(header)
  for (const p of problems) console.error(`  - ${p}`)

  if (isProd) {
    console.error("[security-preflight] Задайте сильные значения в env (см. SECURITY.md) и перезапустите.")
    process.exit(1)
  }
}
