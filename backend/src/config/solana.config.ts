import dotenv from 'dotenv';
import path from 'path';

// Загружаем .env из корня backend/
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function getEnv(key: string, fallback = ''): string {
  return process.env[key] || fallback;
}

export const solanaConfig = {
  /** RPC-эндпоинт Solana (mainnet-beta / devnet / localnet) */
  rpcUrl: getEnv('SOLANA_RPC_URL', 'https://api.mainnet-beta.solana.com'),

  /** Приватный ключ treasury-кошелька в формате base58 */
  treasurySecretKey: getEnv('TREASURY_SECRET_KEY'),

  /** Mint-адрес SPL-токена TimeCoin (TC) */
  tcMintAddress: getEnv('TC_MINT_ADDRESS'),

  /** Флаг — конфиг полностью настроен */
  isConfigured: !!(getEnv('TREASURY_SECRET_KEY') && getEnv('TC_MINT_ADDRESS')),
} as const;

export type SolanaConfig = typeof solanaConfig;
