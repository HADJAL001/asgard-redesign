import db from '../db/database';

export type SocialProvider = 'google' | 'github';

export interface User {
  id: number;
  email: string;
  password_hash: string;
  username: string;
  display_name?: string;
  level?: number;
  phone?: string | null;
  google_id?: string | null;
  github_id?: string | null;
  ip_address?: string | null;
  is_linked?: boolean | number;
  last_login?: number | null;
  referral_code?: string;
  referred_by?: number | null;
  is_verified?: boolean;
  twofa_secret?: string | null;
  twofa_enabled?: boolean;
  nonce?: number;
  role?: string;
  banned?: boolean | number;
  created_at?: string | number;
  updated_at?: string | number;
}

export interface CreateUserInput {
  email?: string | null;
  password_hash?: string | null;
  username: string;
  phone?: string | null;
  ip_address?: string | null;
  referral_code?: string;
  referred_by?: number | null;
  is_verified?: boolean;
  twofa_secret?: string | null;
  twofa_enabled?: boolean;
  nonce?: number;
  role?: string;
  provider?: SocialProvider;
  providerId?: string;
}

export const UserModel = {
  // Найти пользователя по ID
  findById(id: number): User | undefined {
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined;
  },

  // Найти пользователя по email
  findByEmail(email: string): User | undefined {
    return db.prepare('SELECT * FROM users WHERE email = ?').get(email) as User | undefined;
  },

  // Найти пользователя по username
  findByUsername(username: string): User | undefined {
    return db.prepare('SELECT * FROM users WHERE username = ?').get(username) as User | undefined;
  },

  // Найти по реферальному коду
  findByReferralCode(code: string): User | undefined {
    try {
      return db.prepare('SELECT * FROM users WHERE referral_code = ?').get(code) as User | undefined;
    } catch (e) {
      return undefined;
    }
  },

  // Найти пользователя по телефону
  findByPhone(phone: string): User | undefined {
    try {
      return db.prepare('SELECT * FROM users WHERE phone = ?').get(phone) as User | undefined;
    } catch (e) {
      return undefined;
    }
  },

  // Найти пользователя по ID соцпровайдера (google/github)
  findBySocialId(provider: SocialProvider, id: string): User | undefined {
    try {
      return db.prepare(`SELECT * FROM users WHERE ${provider}_id = ?`).get(id) as User | undefined;
    } catch (e) {
      return undefined;
    }
  },

  // Алиас findBySocialId с именованием по спецификации шага 2
  findByProvider(provider: SocialProvider, id: string): User | undefined {
    return UserModel.findBySocialId(provider, id);
  },

  // Найти пользователя по email ИЛИ по телефону
  findByEmailOrPhone(email?: string | null, phone?: string | null): User | undefined {
    if (email) {
      const byEmail = UserModel.findByEmail(email);
      if (byEmail) return byEmail;
    }
    if (phone) {
      const byPhone = UserModel.findByPhone(phone);
      if (byPhone) return byPhone;
    }
    return undefined;
  },

  // Проверить, занят ли username
  isUsernameTaken(username: string): boolean {
    return !!UserModel.findByUsername(username);
  },

  // Проверить, привязан ли к пользователю хотя бы один соцпровайдер
  isLinked(userId: number): boolean {
    try {
      const result = db.prepare('SELECT is_linked FROM users WHERE id = ?').get(userId) as
        | { is_linked: number }
        | undefined;
      return !!result?.is_linked;
    } catch (e) {
      return false;
    }
  },

  // Привязать соцаккаунт к существующему пользователю
  linkSocialAccount(userId: number, provider: SocialProvider, socialId: string): void {
    db.prepare(`UPDATE users SET ${provider}_id = ?, is_linked = 1 WHERE id = ?`).run(socialId, userId);
  },

  // Привязать провайдера с защитой от спама (провайдер/email/телефон не должны
  // принадлежать другому аккаунту) и дозаполнением email/телефона, если их не было.
  linkProvider(
    userId: number,
    provider: SocialProvider,
    providerId: string,
    email?: string | null,
    phone?: string | null,
  ): void {
    const existing = UserModel.findBySocialId(provider, providerId);
    if (existing && existing.id !== userId) {
      throw new Error(`Этот аккаунт ${provider} уже привязан к другому пользователю`);
    }

    if (email) {
      const byEmail = UserModel.findByEmail(email);
      if (byEmail && byEmail.id !== userId) {
        throw new Error('Этот email уже используется другим аккаунтом');
      }
    }
    if (phone) {
      const byPhone = UserModel.findByPhone(phone);
      if (byPhone && byPhone.id !== userId) {
        throw new Error('Этот телефон уже используется другим аккаунтом');
      }
    }

    const user = UserModel.findById(userId);
    const setEmail = email && !user?.email ? email : undefined;
    const setPhone = phone && !user?.phone ? phone : undefined;

    const columns = [`${provider}_id = ?`, 'is_linked = 1'];
    const values: any[] = [providerId];
    if (setEmail) {
      columns.push('email = ?');
      values.push(setEmail);
    }
    if (setPhone) {
      columns.push('phone = ?');
      values.push(setPhone);
    }
    values.push(userId);

    db.prepare(`UPDATE users SET ${columns.join(', ')} WHERE id = ?`).run(...values);
  },

  // Создать пользователя — совместимо со схемой устаревшей, ныне удалённой ручной миграции
  // Схема: id, email, password_hash, username, balance_credits, balance_shards,
  //        balance_crystals, balance_tc, referral_code, referred_by, is_verified,
  //        twofa_secret, twofa_enabled, nonce, role, created_at, updated_at
  create(data: CreateUserInput): number {
    // Защита от спама: один email/телефон — один аккаунт.
    if (data.email && UserModel.findByEmail(data.email)) {
      throw new Error('Пользователь с таким email уже существует');
    }
    if (data.phone && UserModel.findByPhone(data.phone)) {
      throw new Error('Пользователь с таким телефоном уже существует');
    }
    if (UserModel.isUsernameTaken(data.username)) {
      throw new Error('Username уже занят');
    }
    if (data.provider && data.providerId && UserModel.findBySocialId(data.provider, data.providerId)) {
      throw new Error(`Этот аккаунт ${data.provider} уже привязан к другому пользователю`);
    }

    // display_name существует только в legacy-схеме (backend/src/scripts/init-db.ts,
    // NOT NULL без default) и отсутствует в устаревшей, ныне удалённой ручной миграции — заполняем
    // её только если колонка реально есть, чтобы работать на обеих схемах.
    const hasDisplayName = (db.prepare(`PRAGMA table_info(users)`).all() as { name: string }[])
      .some((c) => c.name === 'display_name');

    const columns = ['email', 'password_hash', 'username']
    const values: any[] = [data.email ?? null, data.password_hash ?? null, data.username]

    if (hasDisplayName) {
      columns.push('display_name')
      values.push(data.username)
    }

    columns.push('phone', 'ip_address', 'referral_code', 'referred_by', 'is_verified', 'twofa_secret', 'twofa_enabled', 'nonce', 'role')
    values.push(
      data.phone ?? null,
      data.ip_address ?? null,
      data.referral_code ?? null,
      data.referred_by ?? null,
      data.is_verified ? 1 : 0,
      data.twofa_secret ?? null,
      data.twofa_enabled ? 1 : 0,
      data.nonce ?? 0,
      data.role ?? 'user',
    )

    // Есть провайдер — сразу помечаем аккаунт как привязанный к соцсети.
    if (data.provider && data.providerId) {
      columns.push(`${data.provider}_id`, 'is_linked')
      values.push(data.providerId, 1)
    }

    const stmt = db.prepare(`
      INSERT INTO users (${columns.join(', ')})
      VALUES (${columns.map(() => '?').join(', ')})
    `);

    const info = stmt.run(...values);

    return info.lastInsertRowid as number;
  },

  // Обновить баланс (для обратной совместимости — обновляет wallets)
  updateBalance(userId: number, currency: 'credits' | 'shards' | 'crystals' | 'tc', delta: number): void {
    const field = currency === 'tc' ? 'timecoin' : currency;
    try {
      db.prepare(`UPDATE wallets SET ${field} = ${field} + ? WHERE user_id = ?`).run(delta, userId);
    } catch (e) {
      // wallets может не существовать
    }
  },

  // Получить текущий nonce
  getNonce(userId: number): number {
    try {
      const result = db.prepare('SELECT nonce FROM users WHERE id = ?').get(userId) as { nonce: number } | undefined;
      return result?.nonce || 0;
    } catch (e) {
      return 0;
    }
  },

  // Обновить 2FA
  updateTwoFA(userId: number, secret: string | null, enabled: boolean): void {
    try {
      db.prepare('UPDATE users SET twofa_secret = ?, twofa_enabled = ? WHERE id = ?').run(secret, enabled ? 1 : 0, userId);
    } catch (e) {
      // колонки могут не существовать
    }
  },

  // Проверить, является ли пользователь админом
  isAdmin(userId: number): boolean {
    try {
      const result = db.prepare('SELECT role FROM users WHERE id = ?').get(userId) as { role: string } | undefined;
      return result?.role === 'admin';
    } catch (e) {
      return false;
    }
  },

  // Проверить, заблокирован ли пользователь (актуальный статус из БД)
  isBanned(userId: number): boolean {
    try {
      const result = db.prepare('SELECT banned FROM users WHERE id = ?').get(userId) as { banned: number | boolean } | undefined;
      return !!result?.banned;
    } catch (e) {
      return false;
    }
  },

  // Получить топ пользователей по балансу
  getTopByBalance(limit: number = 10): User[] {
    try {
      return db.prepare(`
        SELECT u.id, u.username FROM users u
        ORDER BY u.id DESC
        LIMIT ?
      `).all(limit) as unknown as User[];
    } catch (e) {
      return [];
    }
  },

  // Удалить пользователя
  delete(userId: number): void {
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  },

  // Обновить время последнего входа
  updateLastLogin(userId: number): void {
    try {
      db.prepare('UPDATE users SET updated_at = CURRENT_TIMESTAMP, last_login = unixepoch() WHERE id = ?').run(userId);
    } catch (e) {
      // updated_at/last_login может не существовать
    }
  }
};
