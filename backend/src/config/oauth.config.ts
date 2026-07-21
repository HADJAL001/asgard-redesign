import dotenv from 'dotenv';

dotenv.config();

export type SocialProvider = 'google' | 'github';

export const SOCIAL_PROVIDERS: SocialProvider[] = ['google', 'github'];

export function isSocialProvider(value: string): value is SocialProvider {
  return (SOCIAL_PROVIDERS as string[]).includes(value);
}

export interface OAuthProviderConfig {
  clientId: string;
  clientSecret: string;
  authUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scope: string;
  // требует ли провайдер PKCE
  requiresPkce: boolean;
}

export const OAUTH_CONFIG: Record<SocialProvider, OAuthProviderConfig> = {
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://www.googleapis.com/oauth2/v3/userinfo',
    scope: 'openid email profile',
    requiresPkce: true,
  },
  github: {
    clientId: process.env.GITHUB_CLIENT_ID || '',
    clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
    authUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    userInfoUrl: 'https://api.github.com/user',
    scope: 'read:user user:email',
    requiresPkce: true,
  },
};

export const BACKEND_PUBLIC_URL = process.env.BACKEND_PUBLIC_URL || 'http://localhost:3002';
export const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

export function getRedirectUri(provider: SocialProvider): string {
  return `${BACKEND_PUBLIC_URL}/auth/${provider}/callback`;
}
