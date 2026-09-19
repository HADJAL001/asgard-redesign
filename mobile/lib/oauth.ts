import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3003';

export type OAuthProvider = 'google' | 'github';

export type OAuthResult =
  | { ok: true; token: string; refreshToken: string }
  | { ok: false; message: string };

/**
 * Открывает системный браузер на бэкенд-эндпоинте OAuth (PKCE, см.
 * backend/src/routes/oauth.routes.ts) и ждёт редиректа обратно на deep link приложения.
 * Бэкенд сам обменивает code провайдера. В deep link приходит только короткоживущий
 * одноразовый код, который приложение обменивает на сессию по HTTPS.
 */
export async function signInWithProvider(provider: OAuthProvider): Promise<OAuthResult> {
  const redirectUri = Linking.createURL('oauth-callback');
  const authUrl = `${API_URL}/auth/${provider}?platform=mobile&redirectUri=${encodeURIComponent(redirectUri)}`;

  const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);

  if (result.type !== 'success' || !result.url) {
    return { ok: false, message: result.type === 'cancel' ? 'Вход отменён' : 'Не удалось войти' };
  }

  const parsed = Linking.parse(result.url);
  const { code, error } = parsed.queryParams as Record<string, string | undefined>;

  if (error) {
    return { ok: false, message: describeOAuthError(error) };
  }
  if (!code) {
    return { ok: false, message: 'Провайдер не вернул код подтверждения' };
  }
  try {
    const response = await fetch(`${API_URL}/auth/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const session = await response.json() as { token?: string; refreshToken?: string };
    if (!response.ok || !session.token || !session.refreshToken) {
      return { ok: false, message: 'Код подтверждения устарел. Попробуйте войти снова' };
    }
    return { ok: true, token: session.token, refreshToken: session.refreshToken };
  } catch {
    return { ok: false, message: 'Не удалось подтвердить вход' };
  }
}

function describeOAuthError(code: string): string {
  switch (code) {
    case 'invalid_state':
      return 'Сессия входа устарела, попробуйте снова';
    case 'provider_mismatch':
      return 'Ошибка провайдера входа';
    case 'oauth_failed':
      return 'Не удалось войти через провайдера';
    default:
      return 'Доступ отклонён';
  }
}
