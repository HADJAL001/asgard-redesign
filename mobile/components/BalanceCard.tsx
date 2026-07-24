import type { ReactNode } from 'react';
import { View, Text } from 'react-native';

import { Card } from '@/components/ui/Card';
import { AnimatedBalance } from '@/components/AnimatedBalance';
import { cn } from '@/lib/utils';
import { colors } from '@/design-system/colors';
import { typography } from '@/design-system/typography';

export type BalanceRow = {
  key: string;
  icon: ReactNode;
  label: string;
  value: number;
  format: (n: number) => string;
  /** Символ/суффикс валюты, рисуется отдельным (не анимированным) текстом после суммы. */
  suffix?: string;
  /** Отделить строку сверху бордером (используется для "итоговой" строки вроде USD-баланса). */
  dividerAbove?: boolean;
};

type BalanceCardProps = {
  rows: BalanceRow[];
};

const amountStyle = { fontFamily: typography.balance.fontFamily, fontSize: 16, color: colors.text };

/**
 * Карточка баланса кошелька: список валют с odometer-анимацией сумм, шрифт Playfair Display
 * для цифр и navy-tinted тень вместо стандартной плоской карточки.
 */
export function BalanceCard({ rows }: BalanceCardProps) {
  return (
    <Card
      className="gap-3"
      style={{
        shadowColor: colors.navy,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.5,
        shadowRadius: 16,
        elevation: 8,
      }}
    >
      {rows.map((row) => (
        <View
          key={row.key}
          className={cn(
            'flex-row items-center justify-between',
            row.dividerAbove && 'border-t border-border pt-3',
          )}
        >
          <View className="flex-row items-center gap-2">
            {row.icon}
            <Text className="text-muted">{row.label}</Text>
          </View>
          <View className="flex-row items-center">
            <AnimatedBalance
              value={row.value}
              format={row.format}
              style={{ ...amountStyle, padding: 0, textAlign: 'right' }}
            />
            {row.suffix ? <Text style={[amountStyle]}> {row.suffix}</Text> : null}
          </View>
        </View>
      ))}
    </Card>
  );
}
