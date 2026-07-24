import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { colors } from '@/design-system/colors';

type PremiumSurfaceProps = {
  children: ReactNode;
  borderRadius?: number;
  style?: ViewStyle;
};

/**
 * Переиспользуемая "премиум" поверхность: navy-tinted тень + тонкий edge-highlight сверху +
 * едва заметная текстура. Bitmap noise-ассета в проекте нет, поэтому шум имитируется диагональным
 * градиентом низкой непрозрачности — визуально ближе к сатину/металлу, чем плоская заливка.
 * Используется в ArtifactCard; предназначена для переиспользования в карточках тарифов.
 */
export function PremiumSurface({ children, borderRadius = 20, style }: PremiumSurfaceProps) {
  return (
    <View
      style={[
        {
          borderRadius,
          shadowColor: colors.navy,
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.55,
          shadowRadius: 20,
          elevation: 10,
        },
        style,
      ]}
    >
      <View style={{ borderRadius, overflow: 'hidden' }}>
        {children}

        <LinearGradient
          pointerEvents="none"
          colors={['rgba(255,255,255,0.10)', 'rgba(255,255,255,0)']}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1.5 }}
        />

        <LinearGradient
          pointerEvents="none"
          colors={['rgba(255,255,255,0.035)', 'rgba(0,0,0,0.05)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
      </View>
    </View>
  );
}
