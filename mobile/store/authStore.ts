import { create } from 'zustand';
import { apiClient, clearTokens, getAccessToken, getRefreshToken, setTokens } from '@/lib/api-client';

export type OsgardUser = {
  id: number;
  username: string;
  email?: string;
  referralCode?: string;
};

type AuthState = {
  user: OsgardUser | null;
  isHydrated: boolean;
  isAuthenticated: boolean;
  /** true только сразу после явного login/register/loginWithToken в этом запуске приложения —
   *  отличает "пользователь только что доказал личность паролем/OAuth" от молчаливого
   *  восстановления сессии по сохранённому токену при hydrate(). Используется root layout'ом,
   *  чтобы не показывать biometric-lock сразу после обычного входа. */
  justLoggedIn: boolean;
  hydrate: () => Promise<void>;
  /** twofaCode — TOTP или резервный код; передаётся на втором шаге, когда бэкенд
   *  вернул twofaRequired на первом (только пароль). */
  login: (
    identifier: string,
    password: string,
    twofaCode?: string,
  ) => Promise<{ ok: boolean; message?: string; twofaRequired?: boolean }>;
  register: (
    username: string,
    email: string,
    password: string,
    referralCode?: string,
  ) => Promise<{ ok: boolean; message?: string }>;
  /** Принимает пару токенов, полученную из OAuth deep-link редиректа (см. lib/oauth.ts),
   *  и подтягивает профиль — без этого шага store не узнал бы, что вход уже произошёл. */
  loginWithToken: (token: string, refreshToken: string) => Promise<{ ok: boolean; message?: string }>;
  logout: () => Promise<void>;
};

type AuthResponse = { success: boolean; token: string; refreshToken: string; user: OsgardUser };
// Ответ логина, когда включена 2FA и код ещё не предъявлен (токены не выданы).
type TwofaChallenge = { success: false; twofaRequired: true };

// Бэкенд матчит вход по конкретному полю (email -> findByEmail, иначе -> findByUsername),
// поэтому на клиенте нужно определить, что именно ввёл пользователь в единое поле логина.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isHydrated: false,
  isAuthenticated: false,
  justLoggedIn: false,

  hydrate: async () => {
    const token = await getAccessToken();
    if (!token) {
      set({ isHydrated: true, isAuthenticated: false, justLoggedIn: false });
      return;
    }
    try {
      const data = await apiClient.get<{ user: OsgardUser }>('/auth/me');
      set({ user: data.user, isAuthenticated: true, isHydrated: true, justLoggedIn: false });
    } catch {
      await clearTokens();
      set({ user: null, isAuthenticated: false, isHydrated: true, justLoggedIn: false });
    }
  },

  login: async (identifier, password, twofaCode) => {
    try {
      const credentials = EMAIL_RE.test(identifier) ? { email: identifier } : { username: identifier };
      // 6 цифр — TOTP, иначе резервный код (формат xxxxx-xxxxx).
      const twofaField = twofaCode
        ? /^\d{6}$/.test(twofaCode.trim())
          ? { twofaToken: twofaCode.trim() }
          : { backupCode: twofaCode.trim() }
        : {};
      const data = await apiClient.post<AuthResponse | TwofaChallenge>(
        '/auth/login',
        { ...credentials, password, ...twofaField },
        { auth: false },
      );
      // Бэкенд запросил второй фактор — токенов ещё нет.
      if ('twofaRequired' in data && data.twofaRequired) {
        return { ok: false, twofaRequired: true, message: 'Введите код двухфакторной аутентификации' };
      }
      const authData = data as AuthResponse;
      await setTokens(authData.token, authData.refreshToken);
      set({ user: authData.user, isAuthenticated: true, justLoggedIn: true });
      return { ok: true };
    } catch (e: any) {
      return { ok: false, message: e.message ?? 'Не удалось войти' };
    }
  },

  register: async (username, email, password, referralCode) => {
    try {
      const data = await apiClient.post<AuthResponse>(
        '/auth/register',
        { username, email, password, referralCode },
        { auth: false },
      );
      await setTokens(data.token, data.refreshToken);
      set({ user: data.user, isAuthenticated: true, justLoggedIn: true });
      return { ok: true };
    } catch (e: any) {
      return { ok: false, message: e.message ?? 'Не удалось зарегистрироваться' };
    }
  },

  loginWithToken: async (token, refreshToken) => {
    try {
      await setTokens(token, refreshToken);
      const data = await apiClient.get<{ user: OsgardUser }>('/auth/me');
      set({ user: data.user, isAuthenticated: true, isHydrated: true, justLoggedIn: true });
      return { ok: true };
    } catch (e: any) {
      await clearTokens();
      return { ok: false, message: e.message ?? 'Не удалось завершить вход через провайдера' };
    }
  },

  logout: async () => {
    // Best-effort отзыв refresh-сессии на бэкенде (передаём refresh-токен явно —
    // сервер отзовёт именно её). Не блокируем локальную очистку, если сеть упала.
    try {
      const refreshToken = await getRefreshToken();
      await apiClient.post('/auth/logout', { refreshToken });
    } catch {
      /* оффлайн/ошибка — access короткоживущий, refresh протухнет сам за 7 дней */
    }
    await clearTokens();
    set({ user: null, isAuthenticated: false, justLoggedIn: false });
  },
}));
