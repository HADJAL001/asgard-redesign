import type { TextStyle } from 'react-native';

export const typography = {
  h1: { fontSize: 32, fontWeight: '700' },
  h2: { fontSize: 24, fontWeight: '600' },
  h3: { fontSize: 18, fontWeight: '600' },
  body: { fontSize: 16, fontWeight: '400' },
  caption: { fontSize: 14, fontWeight: '400' },
  /** Крупные суммы баланса — Playfair Display, вес уже задан именем шрифта (fontWeight не указываем). */
  balance: { fontFamily: 'PlayfairDisplay_600SemiBold', fontSize: 34 },
  /** Мелкие подписи с увеличенным трекингом (капс-лейблы над значениями). */
  label: { fontSize: 12, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase' },
  /** Заголовки премиум-карточек — чуть более просторный трекинг, чем у h2/h3. */
  title: { fontSize: 20, fontWeight: '700', letterSpacing: 0.6 },
} satisfies Record<string, TextStyle>;

export type Typography = typeof typography;
