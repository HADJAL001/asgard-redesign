import { Router, Request, Response } from 'express';
import db from '../db/database';
import { UserModel } from '../models/user.model';
import { AuthService } from '../services/auth.service';
import { requireAuth } from '../middleware/authMiddleware';
import { encrypt } from '../utils/encryption';
import {
  isSocialProvider,
  SocialProvider,
  FRONTEND_URL,
} from '../config/oauth.config';
import {
  buildAuthUrl,
  exchangeCodeForToken,
  fetchNormalizedProfile,
  generatePkcePair,
  generateState,
} from '../services/oauth-providers';
import { captureError } from '../lib/sentry';

const router = Router();

interface OAuthStateEntry {
  provider: SocialProvider;
  codeVerifier: string;
  createdAt: number;
  linkUserId?: number;
  /** 'publish' — подключение GitHub для публикации сгенерированных проектов (scope repo),
   *  отдельно от обычного входа/привязки аккаунта (scope read:user user:email). */
  purpose?: 'login' | 'publish';
  /** Путь на фронтенде, куда вернуть пользователя после успешного подключения (только 'publish'). */
  returnTo?: string;
  /** 'mobile' — запрос пришёл из Expo-приложения, финальный редирект должен уйти в deep link
   *  (mobileRedirectUri), а не на веб-фронтенд. Отсутствие поля означает обычный веб-флоу. */
  platform?: 'web' | 'mobile';
  /** Deep link мобильного приложения (например exp://... или osgard://...), куда редиректить
   *  после успешного/неуспешного OAuth. Провалидирован sanitizeMobileRedirectUri при приёме. */
  mobileRedirectUri?: string;
}

/** Разрешает только относительные пути ("/projects/5"), чтобы state.returnTo нельзя было
 *  использовать для open-redirect на внешний домен. */
function sanitizeReturnTo(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  if (!value.startsWith('/') || value.startsWith('//')) return undefined;
  return value;
}

/** Разрешает только кастомные схемы (exp://, osgard://, myapp://...) для мобильного deep-link
 *  редиректа. Явно отклоняет http(s), иначе state.mobileRedirectUri стал бы open-redirect'ом
 *  на произвольный веб-домен с токенами доступа в query. */
function sanitizeMobileRedirectUri(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return undefined;
  }
  if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return undefined;
  return value;
}

/** Scope для подключения GitHub с целью публикации репозиториев (Git Data API). */
const GITHUB_PUBLISH_SCOPE = 'repo read:user';

const STATE_TTL_MS = 5 * 60 * 1000;
const stateStore = new Map<string, OAuthStateEntry>();

setInterval(() => {
  const now = Date.now();
  for (const [state, entry] of stateStore.entries()) {
    if (now - entry.createdAt > STATE_TTL_MS) {
      stateStore.delete(state);
    }
  }
}, STATE_TTL_MS);

function generateUniqueUsername(seed: string, fallback: string): string {
  const base = (seed || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 24) || fallback;

  let candidate = base;
  let suffix = 0;
  while (UserModel.findByUsername(candidate)) {
    suffix += 1;
    candidate = `${base}_${suffix}`;
  }
  return candidate;
}

function createStarterWallet(userId: number) {
  try {
    db.prepare(`
      INSERT OR IGNORE INTO wallets (user_id, credits, shards, crystals, timecoin, cash_usd)
      VALUES (?, 100, 0, 0, 0, 0)
    `).run(userId);
  } catch (e) {
    // wallets таблица может не существовать
  }
}

// ===== Инициация OAuth-флоу: GET /auth/:provider =====
router.get('/:provider', (req: Request, res: Response) => {
  const { provider } = req.params;
  if (!isSocialProvider(provider)) {
    return res.status(404).json({ error: 'Unknown provider' });
  }

  let linkUserId: number | undefined;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const decoded = AuthService.verifyAccessToken(authHeader.slice(7));
      if (decoded?.userId) linkUserId = decoded.userId;
    } catch {
      // невалидный токен — просто не привязываем, продолжаем как обычный вход
    }
  }

  const platform = req.query.platform === 'mobile' ? 'mobile' as const : undefined;
  const mobileRedirectUri = platform === 'mobile' ? sanitizeMobileRedirectUri(req.query.redirectUri) : undefined;

  const state = generateState();
  const { codeVerifier, codeChallenge } = generatePkcePair();
  stateStore.set(state, {
    provider,
    codeVerifier,
    createdAt: Date.now(),
    linkUserId,
    purpose: 'login',
    platform,
    mobileRedirectUri,
  });

  res.redirect(buildAuthUrl(provider, state, codeChallenge));
});

// ===== Подключение GitHub для публикации проектов: GET /auth/github/publish/connect =====
// Требует scope repo (в отличие от read:user user:email для обычного входа), поэтому
// не переиспользует GET /:provider — это отдельный, явно авторизованный flow.
router.get('/github/publish/connect', requireAuth, (req: Request, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const state = generateState();
  const { codeVerifier, codeChallenge } = generatePkcePair();
  stateStore.set(state, {
    provider: 'github',
    codeVerifier,
    createdAt: Date.now(),
    linkUserId: userId,
    purpose: 'publish',
    returnTo: sanitizeReturnTo(req.query.returnTo),
  });

  res.redirect(buildAuthUrl('github', state, codeChallenge, GITHUB_PUBLISH_SCOPE));
});

// ===== Callback: GET /auth/:provider/callback =====
router.get('/:provider/callback', async (req: Request, res: Response) => {
  const { provider } = req.params;
  if (!isSocialProvider(provider)) {
    return res.status(404).json({ error: 'Unknown provider' });
  }

  const { code, state, error: providerError } = req.query as Record<string, string | undefined>;

  // Ищем entry по state ещё до валидации (провайдер эхом возвращает исходный state даже
  // при ошибке/отказе пользователя) — это единственный способ узнать platform/mobileRedirectUri
  // для редиректа ошибки обратно в мобильное приложение, а не на веб-фронтенд.
  const pendingEntry = state ? stateStore.get(state) : undefined;
  const isMobile = pendingEntry?.platform === 'mobile' && !!pendingEntry.mobileRedirectUri;

  const redirectError = (errCode: string) => {
    if (isMobile) {
      return res.redirect(`${pendingEntry!.mobileRedirectUri}?error=${encodeURIComponent(errCode)}`);
    }
    return res.redirect(`${FRONTEND_URL}/login?oauthError=${encodeURIComponent(errCode)}`);
  };

  if (providerError) {
    return redirectError(providerError);
  }

  if (!code || !state || !stateStore.has(state)) {
    return redirectError('invalid_state');
  }

  const entry = stateStore.get(state)!;
  stateStore.delete(state);

  if (entry.provider !== provider) {
    return redirectError('provider_mismatch');
  }

  try {
    const accessToken = await exchangeCodeForToken(provider, code, entry.codeVerifier);

    // Режим подключения GitHub для публикации (scope repo) — токен шифруется и
    // сохраняется отдельно от identity-only github_id. Нужен именно login (не display
    // name) — это "owner" для последующих вызовов Git Data API при публикации.
    if (entry.purpose === 'publish' && entry.linkUserId) {
      const ghUser = await (
        await fetch('https://api.github.com/user', {
          headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': 'osgard-backend' },
        })
      ).json() as { login?: string };

      db.prepare(
        `UPDATE users SET github_publish_token_encrypted = ?, github_publish_username = ?, github_publish_connected_at = ? WHERE id = ?`,
      ).run(encrypt(accessToken), ghUser.login || null, Date.now(), entry.linkUserId);
      const target = entry.returnTo || '/dashboard';
      const separator = target.includes('?') ? '&' : '?';
      return res.redirect(`${FRONTEND_URL}${target}${separator}githubPublishConnected=1`);
    }

    const profile = await fetchNormalizedProfile(provider, accessToken);

    // Режим привязки соцаккаунта к уже залогиненному пользователю
    if (entry.linkUserId) {
      UserModel.linkSocialAccount(entry.linkUserId, provider, profile.id);
      return res.redirect(`${FRONTEND_URL}/dashboard?linked=${provider}`);
    }

    let user = UserModel.findBySocialId(provider, profile.id);

    if (!user && profile.email) {
      user = UserModel.findByEmail(profile.email);
      if (user) {
        UserModel.linkSocialAccount(user.id, provider, profile.id);
      }
    }

    if (!user) {
      const username = generateUniqueUsername(profile.name || '', `${provider}_${profile.id}`);
      const userId = UserModel.create({
        email: profile.email,
        password_hash: null,
        username,
        is_verified: true,
        role: 'user',
      });
      UserModel.linkSocialAccount(userId, provider, profile.id);
      createStarterWallet(userId);
      user = UserModel.findById(userId);
    }

    if (!user) {
      throw new Error('Failed to resolve user after OAuth callback');
    }

    UserModel.updateLastLogin(user.id);

    const token = AuthService.generateAccessToken(user.id);
    const refreshToken = AuthService.generateRefreshToken(user.id);

    if (isMobile) {
      return res.redirect(
        `${pendingEntry!.mobileRedirectUri}?token=${encodeURIComponent(token)}&refreshToken=${encodeURIComponent(refreshToken)}`
      );
    }

    res.redirect(
      `${FRONTEND_URL}/auth/callback?token=${encodeURIComponent(token)}&refreshToken=${encodeURIComponent(refreshToken)}`
    );
  } catch (e: any) {
    captureError(`OAuth callback error (${provider}):`, e);
    redirectError('oauth_failed');
  }
});

// ===== Отвязка соцаккаунта: POST /auth/:provider/unlink =====
router.post('/:provider/unlink', requireAuth, (req: Request, res: Response) => {
  const { provider } = req.params;
  if (!isSocialProvider(provider)) {
    return res.status(404).json({ error: 'Unknown provider' });
  }

  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    db.prepare(`UPDATE users SET ${provider}_id = NULL WHERE id = ?`).run(userId);

    const user = UserModel.findById(userId);
    const stillLinked = user
      ? ['google', 'github'].some(
          (p) => (user as any)[`${p}_id`] != null
        )
      : false;

    if (!stillLinked) {
      db.prepare(`UPDATE users SET is_linked = 0 WHERE id = ?`).run(userId);
    }

    res.json({ success: true });
  } catch (e: any) {
    captureError('Unlink error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
