import db from '../db/database';

export interface User {
  id: number;
  email: string;
  password_hash: string;
  username: string;
  balance_credits: number;
  balance_shards: number;
  balance_crystals: number;
  balance_tc: number;
  referral_code: string;
  referred_by: number | null;
  is_verified: boolean;
  twofa_secret: string | null;
  twofa_enabled: boolean;
  nonce: number;
  role: string;
  created_at: string;
  updated_at: string;
}

export interface CreateUserInput {
  email: string;
  password_hash: string;
  username: string;
  balance_credits?: number;
  balance_shards?: number;
  balance_crystals?: number;
  balance_tc?: number;
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
    return db.prepare('SELECT * FROM users WHERE referral_code = ?').get(code) as User | undefined;
  },

  // Создать пользователя
  create(data: CreateUserInput): number {
    const stmt = db.prepare(`
      INSERT INTO users (
        email, password_hash, username, balance_credits, balance_shards,
        balance_crystals, balance_tc, referral_code, referred_by, is_verified,
        twofa_secret, twofa_enabled, nonce, role
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const info = stmt.run(
      data.email,
      data.password_hash,
      data.username,
      data.balance_credits || 0,
      data.balance_shards || 0,
      data.balance_crystals || 0,
      data.balance_tc || 0,
      data.referral_code || null,
      data.referred_by || null,
      data.is_verified || 0,
      data.twofa_secret || null,
      data.twofa_enabled || 0,
      data.nonce || 0,
      data.role || 'user'
    );
    
    return info.lastInsertRowid as number;
  },

  // Обновить баланс пользователя
  updateBalance(userId: number, currency: 'credits' | 'shards' | 'crystals' | 'tc', delta: number): void {
    const field = `balance_${currency}`;
    db.prepare(`UPDATE users SET ${field} = ${field} + ? WHERE id = ?`).run(delta, userId);
  },

  // Установить баланс пользователя
  setBalance(userId: number, currency: 'credits' | 'shards' | 'crystals' | 'tc', amount: number): void {
    const field = `balance_${currency}`;
    db.prepare(`UPDATE users SET ${field} = ? WHERE id = ?`).run(amount, userId);
  },

  // Инкрементировать nonce (для защиты от replay-атак)
  incrementNonce(userId: number): number {
    const result = db.prepare('UPDATE users SET nonce = nonce + 1 WHERE id = ? RETURNING nonce').get(userId) as { nonce: number } | undefined;
    return result?.nonce || 0;
  },

  // Получить текущий nonce
  getNonce(userId: number): number {
    const result = db.prepare('SELECT nonce FROM users WHERE id = ?').get(userId) as { nonce: number } | undefined;
    return result?.nonce || 0;
  },

  // Обновить 2FA
  updateTwoFA(userId: number, secret: string | null, enabled: boolean): void {
    db.prepare('UPDATE users SET twofa_secret = ?, twofa_enabled = ? WHERE id = ?').run(secret, enabled ? 1 : 0, userId);
  },

  // Проверить, является ли пользователь админом
  isAdmin(userId: number): boolean {
    const result = db.prepare('SELECT role FROM users WHERE id = ?').get(userId) as { role: string } | undefined;
    return result?.role === 'admin';
  },

  // Получить топ пользователей по балансу
  getTopByBalance(limit: number = 10): User[] {
    return db.prepare(`
      SELECT id, username, balance_tc, balance_credits, balance_shards, balance_crystals
      FROM users 
      ORDER BY balance_tc DESC 
      LIMIT ?
    `).all(limit) as User[];
  },

  // Удалить пользователя (мягкое удаление - можно добавить поле deleted_at)
  delete(userId: number): void {
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  },

  // Обновить время последнего входа
  updateLastLogin(userId: number): void {
    db.prepare('UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(userId);
  }
};

// Тест модели (можно запустить отдельно)
if (require.main === module) {
  console.log('🧪 Testing UserModel...');
  const user = UserModel.findById(1);
  console.log('User:', user);
}
