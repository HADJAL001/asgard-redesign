import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import crypto from 'crypto';
import { encrypt, decryptOrPlain } from '../utils/encryption';

/* Кол-во одноразовых резервных кодов, выдаваемых при активации 2FA. */
const BACKUP_CODE_COUNT = 10;

export class TwoFAService {
  static generateSecret(email: string) {
    const secret = speakeasy.generateSecret({ length: 20, name: `OSGARD:${email}` });
    return {
      secret: secret.base32,
      otpauth_url: secret.otpauth_url as string
    };
  }

  /* Проверка TOTP-кода. window: 1 — допускаем соседний 30-сек интервал, чтобы
     сгладить рассинхрон часов клиента/сервера (стандартная практика). */
  static verifyToken(secret: string, token: string): boolean {
    return speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token: String(token).replace(/\s+/g, ''),
      window: 1
    });
  }

  static async generateQR(otpauth_url: string): Promise<string> {
    return QRCode.toDataURL(otpauth_url);
  }

  /* ---------- Шифрование секрета «в покое» ----------
     Секрет 2FA — это, по сути, эквивалент второго пароля: при утечке дампа БД
     он позволяет генерировать валидные TOTP-коды. Раньше хранился открытым
     текстом. Шифруем тем же AES-ключом (ENCRYPTION_KEY), что и email.
     decryptOrPlain на чтении обеспечивает обратную совместимость со старыми
     незашифрованными секретами. */
  static encryptSecret(secret: string): string {
    return encrypt(secret);
  }

  static decryptSecret(stored: string): string {
    return decryptOrPlain(stored);
  }

  static verifyStoredToken(storedSecret: string, token: string): boolean {
    return TwoFAService.verifyToken(TwoFAService.decryptSecret(storedSecret), token);
  }

  /* ---------- Резервные коды ----------
     Генерируем набор одноразовых кодов на случай потери доступа к TOTP-приложению.
     Пользователю показываем открытые коды ОДИН раз (при активации), в БД храним
     только их SHA-256-хеши (коды высокоэнтропийные, соль не нужна — брутфорс
     невозможен). Использованный код удаляется из набора. */
  static generateBackupCodes(): { plain: string[]; hashed: string[] } {
    const plain: string[] = [];
    const hashed: string[] = [];
    for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
      // 10 hex-символов → формат xxxxx-xxxxx для читаемости
      const raw = crypto.randomBytes(5).toString('hex');
      const code = `${raw.slice(0, 5)}-${raw.slice(5)}`;
      plain.push(code);
      hashed.push(TwoFAService.hashBackupCode(code));
    }
    return { plain, hashed };
  }

  static hashBackupCode(code: string): string {
    return crypto
      .createHash('sha256')
      .update(String(code).trim().toLowerCase())
      .digest('hex');
  }

  /* Хранилище backup-кодов в БД — JSON-массив хешей, зашифрованный целиком.
     Возвращаем обновлённый массив без израсходованного кода, либо null если
     код не найден/невалиден. */
  static consumeBackupCode(storedJson: string | null, code: string): string[] | null {
    if (!storedJson) return null;
    let hashes: string[];
    try {
      hashes = JSON.parse(decryptOrPlain(storedJson));
    } catch {
      return null;
    }
    if (!Array.isArray(hashes)) return null;

    const target = TwoFAService.hashBackupCode(code);
    const idx = hashes.indexOf(target);
    if (idx === -1) return null;

    hashes.splice(idx, 1);
    return hashes;
  }

  static serializeBackupHashes(hashes: string[]): string {
    return encrypt(JSON.stringify(hashes));
  }

  static countBackupCodes(storedJson: string | null): number {
    if (!storedJson) return 0;
    try {
      const hashes = JSON.parse(decryptOrPlain(storedJson));
      return Array.isArray(hashes) ? hashes.length : 0;
    } catch {
      return 0;
    }
  }
}
