import Joi from 'joi';

export const depositSchema = Joi.object({
  amount: Joi.number().integer().min(1).max(10000).required(),
  // Подпись транзакции Solana, которой пользователь перевёл TC на адрес
  // казначейства (base58, обычно 86-88 символов).
  txSignature: Joi.string().min(64).max(100).required(),
});
