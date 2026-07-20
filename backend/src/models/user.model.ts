import db from '../db/database';

export interface User {
  id: number;
  email: string;
  password_hash: string;
  username: string;
  display_name?: string;
  level?: number;
  referral_code?: string;
  referred_by?: number | null;
  is_verified?: boolean;
  twofa_secret?: string | null;
  twofa_enabled?: boolean;
  nonce?: number;
  role?: string;
  created_at?: string | number;
  updated_at?: string | number;
}

export interface CreateUserInput {
  email: string;
  password_hash: string;
  username: string;
  referral_code?: string;
  referred_by?: number | null;
  is_verified?: boolean;
  twofa_secret?: string | null;
  twofa_enabled?: boolean;
  nonce?: number;
  role?: string;
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

  // Создать пользователя — совместимо со схемой init-db.ts
  // Схема: id, email, password_hash, username, display_name, level, avatar_url, bio, created_at
  create(data: CreateUserInput): number {
    const stmt = db.prepare(`
      INSERT INTO users (email, password_hash, username, display_name, level)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    const info = stmt.run(
      data.email,
      data.password_hash,
      data.username,
      data.username, // display_name = username по умолчанию
      1              // level = 1
    );
    
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
      db.prepare('UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(userId);
    } catch (e) {
      // updated_at может не существовать
    }
  }
};
