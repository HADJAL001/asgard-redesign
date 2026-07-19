import CryptoJS from 'crypto-js';

const SECRET = process.env.ENCRYPTION_KEY || 'default-32-char-key-for-aes';

export const encrypt = (text: string): string =>
  CryptoJS.AES.encrypt(text, SECRET).toString();

export const decrypt = (cipher: string): string =>
  CryptoJS.AES.decrypt(cipher, SECRET).toString(CryptoJS.enc.Utf8);
