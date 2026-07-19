import Joi from 'joi';

export const withdrawSchema = Joi.object({
  amount: Joi.number().integer().min(1).max(10000).required(),
  externalWalletAddress: Joi.string().length(44).pattern(/^[1-9A-HJ-NP-Za-km-z]{44}$/).required(),
  // nonce — одноразовый счётчик от сервера (GET /api/tc/nonce).
  // Обязателен для защиты от replay-атак при выводе TC.
  nonce: Joi.number().integer().min(0).required(),
  // 2FA-токен (опционально, только если 2FA включена у пользователя)
  twofa_token: Joi.string().optional(),
});
