import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';

import { useWalletConvertMutation } from '@/hooks/useWalletConvertMutation';
import { ApiError } from '@/lib/api-client';
import { CURRENCIES, formatCurrencyAmount } from '@/lib/economy';
import { fmtUSD } from '@/lib/tc-market';
import type { CurrencyKey } from '@/types/market';

const CONVERT_CURRENCIES: { id: CurrencyKey; label: string }[] = [
  { id: 'credits', label: CURRENCIES.credits.label },
  { id: 'shards', label: CURRENCIES.shards.label },
  { id: 'crystals', label: CURRENCIES.crystals.label },
  { id: 'cash_usd', label: 'USD' },
];

/**
 * Оценочные курсы к USD и комиссия — зеркало RATE_TO_USD/CONVERT_FEE из
 * backend/src/routes/wallet.routes.ts (POST /wallet/convert). TimeCoin
 * бэкенд конвертировать запрещает, поэтому его нет ни здесь, ни в списке
 * валют выше. Используется только для превью — реальный результат приходит
 * из ответа API.
 */
const RATE_TO_USD_ESTIMATE: Record<CurrencyKey, number> = {
  credits: 0.01,
  shards: 0.1,
  crystals: 1,
  timecoin: 12.4,
  cash_usd: 1,
};
const CONVERT_FEE_ESTIMATE = 0.01;

function formatByCurrency(id: CurrencyKey, n: number): string {
  if (id === 'cash_usd') return fmtUSD(n);
  return formatCurrencyAmount(id, n);
}

export default function ConvertScreen() {
  const [from, setFrom] = useState<CurrencyKey>('credits');
  const [to, setTo] = useState<CurrencyKey>('cash_usd');
  const [amount, setAmount] = useState('');

  const convert = useWalletConvertMutation();
  const toast = useToast();

  const parsedAmount = Number(amount.replace(',', '.'));
  const canSubmit = from !== to && parsedAmount > 0 && !convert.isPending;

  const amountAfterFee = parsedAmount * (1 - CONVERT_FEE_ESTIMATE);
  const estimatedReceive = (amountAfterFee * RATE_TO_USD_ESTIMATE[from]) / RATE_TO_USD_ESTIMATE[to];

  const handleSelectFrom = (id: CurrencyKey) => {
    if (id === to) setTo(from);
    setFrom(id);
  };

  const handleSelectTo = (id: CurrencyKey) => {
    if (id === from) setFrom(to);
    setTo(id);
  };

  const handleConvert = async () => {
    if (!canSubmit) return;
    try {
      const res = await convert.mutateAsync({ from, to, amount: parsedAmount });
      toast.show(`Получено ${formatByCurrency(to, res.conversion.amountReceived)}`, 'success');
      router.back();
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : 'Не удалось выполнить конвертацию', 'error');
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Card className="gap-3">
          <Text className="text-sm font-medium text-muted">Отдаёте</Text>
          <View className="flex-row flex-wrap gap-2">
            {CONVERT_CURRENCIES.map((c) => (
              <Button
                key={c.id}
                size="sm"
                variant={from === c.id ? 'primary' : 'secondary'}
                onPress={() => handleSelectFrom(c.id)}
              >
                {c.label}
              </Button>
            ))}
          </View>

          <Text className="text-sm font-medium text-muted">Получаете</Text>
          <View className="flex-row flex-wrap gap-2">
            {CONVERT_CURRENCIES.map((c) => (
              <Button
                key={c.id}
                size="sm"
                variant={to === c.id ? 'primary' : 'secondary'}
                onPress={() => handleSelectTo(c.id)}
              >
                {c.label}
              </Button>
            ))}
          </View>

          <Input
            label={`Сумма (${CONVERT_CURRENCIES.find((c) => c.id === from)?.label})`}
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={setAmount}
            placeholder="0.00"
          />

          {parsedAmount > 0 && from !== to ? (
            <Text className="text-sm text-muted">
              Примерно получите: {formatByCurrency(to, estimatedReceive)} (комиссия 1%)
            </Text>
          ) : null}

          <Button disabled={!canSubmit} loading={convert.isPending} onPress={handleConvert}>
            Конвертировать
          </Button>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
