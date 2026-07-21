import crypto from 'node:crypto';
import { OAUTH_CONFIG, SocialProvider, getRedirectUri } from '../config/oauth.config';

export interface NormalizedProfile {
  id: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
}

export function generatePkcePair() {
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge };
}

export function generateState(): string {
  return crypto.randomBytes(24).toString('base64url');
}

export function buildAuthUrl(provider: SocialProvider, state: string, codeChallenge: string): string {
  const cfg = OAUTH_CONFIG[provider];
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: getRedirectUri(provider),
    response_type: 'code',
    scope: cfg.scope,
    state,
  });

  if (cfg.requiresPkce) {
    params.set('code_challenge', codeChallenge);
    params.set('code_challenge_method', 'S256');
  }

  if (provider === 'google') {
    params.set('access_type', 'offline');
    params.set('prompt', 'consent');
  }

  return `${cfg.authUrl}?${params.toString()}`;
}

async function requestJson(url: string, init: RequestInit): Promise<any> {
  const res = await fetch(url, init);
  const text = await res.text();
  let body: any;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    // некоторые провайдеры без Accept: application/json могут вернуть form-encoded/текст
    body = Object.fromEntries(new URLSearchParams(text));
  }
  if (!res.ok) {
    throw new Error(`OAuth request to ${url} failed (${res.status}): ${text}`);
  }
  return body;
}

export async function exchangeCodeForToken(
  provider: SocialProvider,
  code: string,
  codeVerifier: string
): Promise<string> {
  const cfg = OAUTH_CONFIG[provider];
  const redirectUri = getRedirectUri(provider);

  const params = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });

  // GitHub требует явный Accept: application/json, иначе вернёт form-encoded тело.
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json',
  };

  const body = await requestJson(cfg.tokenUrl, {
    method: 'POST',
    headers,
    body: params.toString(),
  });

  if (body.error) {
    throw new Error(`OAuth token exchange error (${provider}): ${body.error_description || body.error}`);
  }

  return body.access_token;
}

export async function fetchNormalizedProfile(
  provider: SocialProvider,
  accessToken: string
): Promise<NormalizedProfile> {
  const cfg = OAUTH_CONFIG[provider];

  switch (provider) {
    case 'google': {
      const p = await requestJson(cfg.userInfoUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return { id: p.sub, email: p.email ?? null, name: p.name ?? null, avatarUrl: p.picture ?? null };
    }

    case 'github': {
      const headers = { Authorization: `Bearer ${accessToken}`, 'User-Agent': 'osgard-backend' };
      const p = await requestJson(cfg.userInfoUrl, { headers });

      let email: string | null = p.email ?? null;
      if (!email) {
        try {
          const emails = await requestJson('https://api.github.com/user/emails', { headers });
          const primary = (emails as any[]).find((e) => e.primary && e.verified);
          email = primary?.email ?? null;
        } catch {
          email = null;
        }
      }

      return { id: String(p.id), email, name: p.name ?? p.login ?? null, avatarUrl: p.avatar_url ?? null };
    }

    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}
