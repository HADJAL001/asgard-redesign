import CryptoJS from 'crypto-js';

const SECRET = process.env.ENCRYPTION_KEY || 'default-32-char-key-for-aes';

export const encrypt = (text: string): string =>
  CryptoJS.AES.encrypt(text, SECRET).toString();

export const decrypt = (cipher: string): string =>
  CryptoJS.AES.decrypt(cipher, SECRET).toString(CryptoJS.enc.Utf8);

// crypto-js base64-кодирует "Salted__" + соль перед шифротекстом passphrase-based
// AES, поэтому реальный шифротекст всегда начинается с этого префикса.
const CIPHERTEXT_PREFIX = 'U2FsdGVkX1';

/* Некоторые поля (например users.email) исторически не всегда были
   зашифрованы — простой decrypt() на таких значениях либо кидает
   исключение, либо возвращает мусор. Используется там, где значение
   может быть как шифротекстом, так и обычным текстом. */
export const decryptOrPlain = (value: string): string => {
  if (!value.startsWith(CIPHERTEXT_PREFIX)) return value;
  try {
    return decrypt(value) || value;
  } catch {
    return value;
  }
};
