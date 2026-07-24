export const colors = {
  navy: '#0A1128',
  gold: '#D4AF37',
  goldLight: '#F5D742',
  cyan: '#00F0FF',
  cyanLight: '#4A7FFF',
  dark: '#1A1A2E',
  darkCard: '#16213E',
  text: '#FFFFFF',
  textSecondary: '#8892B0',
  /** Мягкий золотой тон для текста — замена алярмистскому красному в неблокирующих сообщениях. */
  goldTinted: '#E4C77A',
  /** Приглушённое золото для disabled-состояний (вместо серой заливки opacity-50). */
  disabledGold: '#8A7B45',
  /** Единый металл-акцент премиум-темы — используется вместо разрозненных cyan/gold. */
  metal: {
    primary: '#D4AF37',
    light: '#F5D742',
  },
};

export type Colors = typeof colors;
