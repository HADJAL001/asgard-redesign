import Joi from 'joi';

export const transferSchema = Joi.object({
  recipientEmail: Joi.string().email().required(),
  amount: Joi.number().min(0.01).max(10000).required(),
  comment: Joi.string().max(200).allow('').optional(),
  password: Joi.string().required(),
  // 2FA-токен (обязателен, только если 2FA включена у отправителя)
  twofa_token: Joi.string().optional(),
});
