import { DollarSign, type LucideIcon } from 'lucide-react-native';
import { View } from 'react-native';

import { CURRENCIES, type CurrencyId } from '@/lib/economy';

export type WalletCurrencyId = CurrencyId | 'usd';

const USD_META: { Icon: LucideIcon; color: string } = { Icon: DollarSign, color: '#10B981' };

export function CurrencyIcon({ currency, size = 18 }: { currency: WalletCurrencyId; size?: number }) {
  const { Icon, color } = currency === 'usd' ? USD_META : CURRENCIES[currency];
  return (
    <View
      className="items-center justify-center rounded-full"
      style={{ width: size * 1.6, height: size * 1.6, backgroundColor: `${color}22` }}
    >
      <Icon size={size} color={color} />
    </View>
  );
}
