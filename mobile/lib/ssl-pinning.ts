import {
  initializeSslPinning,
  isSslPinningAvailable,
  addSslPinningErrorListener,
} from 'react-native-ssl-public-key-pinning';
import { Sentry } from './sentry';

/* ================================================================
   OSGARD · Certificate pinning (публичные ключи)
   ----------------------------------------------------------------
   Пиннинг публичного ключа (SPKI SHA-256) на нативном уровне:
   OkHttp CertificatePinner (Android) + TrustKit (iOS). После
   initializeSslPinning ВСЕ сетевые запросы (fetch/XHR) к запиненному
   хосту проверяют, что публичный ключ сертификата сервера совпадает
   с одним из ожидаемых — это блокирует MITM с подменой сертификата
   (в т.ч. через доверенный корневой CA на устройстве атакующего).

   БЕЗОПАСНАЯ АКТИВАЦИЯ (fail-safe):
   - Работает только в кастомном dev/prod-билде (не в Expo Go) —
     проверяем isSslPinningAvailable().
   - Пины НЕ хардкодятся: берутся из env (EXPO_PUBLIC_SSL_PIN_PRIMARY/
     _BACKUP). Без валидных пинов пиннинг НЕ включается — dev-сборки и
     сборки до выпуска прод-сертификата продолжают работать.
   - Пинится только https-хост боевого API. localhost/http — никогда.
   - iOS (TrustKit) требует НЕ МЕНЕЕ ДВУХ пинов, иначе initialize
     бросает исключение — поэтому требуем и primary, и backup.

   Как получить хеш публичного ключа (base64 SHA-256 SPKI):
     openssl s_client -servername <host> -connect <host>:443 </dev/null \
       | openssl x509 -pubkey -noout \
       | openssl pkey -pubin -outform der \
       | openssl dgst -sha256 -binary | openssl enc -base64
   Backup-пин снимается с резервного/следующего сертификата или
   промежуточного CA — чтобы ротация сертификата не «окирпичила» клиент.
   ================================================================ */

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? '';
const PRIMARY_PIN = process.env.EXPO_PUBLIC_SSL_PIN_PRIMARY;
const BACKUP_PIN = process.env.EXPO_PUBLIC_SSL_PIN_BACKUP;

/** Извлекает хост из URL, если это https. Для http/localhost/пустого — null. */
function httpsHost(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return null;
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return null;
    return u.hostname;
  } catch {
    return null;
  }
}

/** Инициализирует certificate pinning. Идемпотентно-безопасна: при любом
 *  несоблюдении условий тихо выходит, не ломая сеть приложения. */
export async function initSslPinning(): Promise<void> {
  // 1. Нативный модуль недоступен (Expo Go / web) — пиннинг невозможен.
  if (!isSslPinningAvailable()) {
    if (__DEV__) console.warn('[ssl-pinning] недоступно (Expo Go/web) — пропуск');
    return;
  }

  // 2. Хост должен быть боевым https-хостом.
  const host = httpsHost(API_URL);
  if (!host) {
    if (__DEV__) console.warn('[ssl-pinning] API не https или localhost — пропуск');
    return;
  }

  // 3. Нужны оба пина (iOS TrustKit требует ≥2). Без них не включаем — иначе
  //    рискуем заблокировать вход в приложение до выпуска прод-сертификата.
  const pins = [PRIMARY_PIN, BACKUP_PIN].filter((p): p is string => Boolean(p && p.trim()));
  if (pins.length < 2) {
    if (__DEV__) console.warn('[ssl-pinning] заданы не оба пина (нужны primary+backup) — пропуск');
    return;
  }

  try {
    await initializeSslPinning({
      [host]: {
        includeSubdomains: true,
        publicKeyHashes: pins,
      },
    });

    // Нарушение пиннинга — сигнал возможного MITM. Логируем в Sentry.
    addSslPinningErrorListener((error: { serverHostname: string; message?: string }) => {
      Sentry.captureMessage(`SSL pinning violation: ${error.serverHostname}`, 'error');
    });

    if (__DEV__) console.log(`[ssl-pinning] активен для ${host} (${pins.length} пина)`);
  } catch (e) {
    // Не роняем приложение — фиксируем и продолжаем без пиннинга.
    Sentry.captureException(e);
    if (__DEV__) console.warn('[ssl-pinning] ошибка инициализации:', e);
  }
}
