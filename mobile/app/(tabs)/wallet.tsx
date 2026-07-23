import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';

import { useWalletQuery } from '@/hooks/useWalletQuery';
import { useTcMarketQuery } from '@/hooks/useTcMarketQuery';
import { useMarketBuyMutation } from '@/hooks/useMarketBuyMutation';
import { useMarketSellMutation } from '@/hooks/useMarketSellMutation';
import { useStakesQuery } from '@/hooks/useStakesQuery';
import { useStakeMutation } from '@/hooks/useStakeMutation';
import { useUnstakeMutation } from '@/hooks/useUnstakeMutation';

import { CURRENCY_ORDER, CURRENCIES, formatCurrency } from '@/lib/economy';
import { STAKE_TERMS, MIN_STAKE, fmtUSD, fmtTC } from '@/lib/tc-market';

type ActiveModal = 'buy' | 'sell' | 'stake' | null;

export default function WalletScreen() {
  const { data: wallet, isLoading: walletLoading, isFetching: walletFetching, refetch: refetchWallet } = useWalletQuery();
  const { data: tcState, isFetching: tcFetching, refetch: refetchTcState } = useTcMarketQuery();
  const { data: stakes, isFetching: stakesFetching, refetch: refetchStakes } = useStakesQuery();

  const marketBuy = useMarketBuyMutation();
  const marketSell = useMarketSellMutation();
  const stakeTC = useStakeMutation();
  const unstakeTC = useUnstakeMutation();

  const toast = useToast();
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [amount, setAmount] = useState('');
  const [stakeTermIndex, setStakeTermIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const isRefreshing = walletFetching || tcFetching || stakesFetching;
  const activeStakes = useMemo(() => (stakes ?? []).filter((s) => s.status === 'active'), [stakes]);

  const closeModal = () => {
    setActiveModal(null);
    setAmount('');
    setError(null);
  };

  const handleRefresh = () => {
    refetchWallet();
    refetchTcState();
    refetchStakes();
  };

  const parsedAmount = Number(amount.replace(',', '.'));
  const canSubmitAmount = amount.trim().length > 0 && parsedAmount > 0;

  const handleBuy = async () => {
    if (!canSubmitAmount) return;
    const res = await marketBuy.mutateAsync(parsedAmount);
    if (!res) return;
    toast.show(`Куплено ${fmtTC(res.trade.tcAmount)}`, 'success');
    closeModal();
  };

  const handleSell = async () => {
    if (!canSubmitAmount) return;
    const res = await marketSell.mutateAsync(parsedAmount);
    if (!res) return;
    toast.show(`Продано ${fmtTC(res.trade.tcAmount)}`, 'success');
    closeModal();
  };

  const handleStake = async () => {
    if (!canSubmitAmount) return;
    if (parsedAmount < MIN_STAKE) {
      setError(`Минимум ${fmtTC(MIN_STAKE)}`);
      return;
    }
    const term = STAKE_TERMS[stakeTermIndex];
    await stakeTC.mutateAsync({ amount: parsedAmount, days: term.days });
    toast.show('Стейк открыт', 'success');
    closeModal();
  };

  const handleUnstake = async (stakeId: string | number) => {
    const res = await unstakeTC.mutateAsync(stakeId);
    if (!res) return;
    toast.show(`Стейк закрыт: +${fmtTC(res.reward)}`, 'success');
  };

  if (walletLoading) {
    return <Spinner fullscreen />;
  }

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top']}>
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 12 }}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
      >
        <Text className="text-2xl font-bold text-white">Кошелёк</Text>

        <Card className="gap-3">
          {CURRENCY_ORDER.map((id) => (
            <View key={id} className="flex-row items-center justify-between">
              <Text className="text-muted">{CURRENCIES[id].label}</Text>
              <Text className="text-base font-bold text-white">
                {formatCurrency(id, wallet?.[id] ?? 0)}
              </Text>
            </View>
          ))}
          <View className="flex-row items-center justify-between border-t border-border pt-3">
            <Text className="text-muted">USD-баланс</Text>
            <Text className="text-base font-bold text-white">{fmtUSD(wallet?.cash_usd ?? 0)}</Text>
          </View>
        </Card>

        <Card className="gap-3">
          <View className="flex-row items-center justify-between">
            <Text className="text-muted">Курс TimeCoin</Text>
            <Text className="text-lg font-bold text-accent">{fmtUSD(tcState?.price ?? 0)}</Text>
          </View>
          <View className="flex-row gap-3">
            <Button className="flex-1" variant="primary" onPress={() => setActiveModal('buy')}>
              Купить
            </Button>
            <Button className="flex-1" variant="secondary" onPress={() => setActiveModal('sell')}>
              Продать
            </Button>
          </View>
        </Card>

        <Card className="gap-3">
          <View className="flex-row items-center justify-between">
            <Text className="text-lg font-bold text-white">Стейкинг</Text>
            <Button size="sm" variant="secondary" onPress={() => setActiveModal('stake')}>
              + Открыть стейк
            </Button>
          </View>
          {activeStakes.length === 0 ? (
            <Text className="text-muted">Нет активных стейков</Text>
          ) : (
            activeStakes.map((stake) => (
              <View
                key={stake.id}
                className="flex-row items-center justify-between rounded-xl border border-border bg-bg px-3 py-2"
              >
                <View>
                  <Text className="font-semibold text-white">{fmtTC(stake.amountTC)}</Text>
                  <Text className="text-xs text-muted">
                    {stake.days} дней · APR {(stake.apr * 100).toFixed(0)}%
                  </Text>
                </View>
                <Button size="sm" variant="danger" onPress={() => handleUnstake(stake.id)}>
                  Снять
                </Button>
              </View>
            ))
          )}
        </Card>
      </ScrollView>

      <Modal visible={activeModal === 'buy'} onClose={closeModal} title="Купить TimeCoin">
        <View className="gap-3">
          <Input
            label="Сумма в USD"
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={setAmount}
            placeholder="0.00"
          />
          <Button disabled={!canSubmitAmount} loading={marketBuy.isPending} onPress={handleBuy}>
            Купить
          </Button>
        </View>
      </Modal>

      <Modal visible={activeModal === 'sell'} onClose={closeModal} title="Продать TimeCoin">
        <View className="gap-3">
          <Input
            label={`Сумма в ${fmtTC(0).split(' ')[1]}`}
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={setAmount}
            placeholder="0.00"
          />
          <Button disabled={!canSubmitAmount} loading={marketSell.isPending} onPress={handleSell}>
            Продать
          </Button>
        </View>
      </Modal>

      <Modal visible={activeModal === 'stake'} onClose={closeModal} title="Открыть стейк">
        <View className="gap-3">
          <Input
            label="Сумма TimeCoin"
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={setAmount}
            error={error}
            placeholder={String(MIN_STAKE)}
          />
          <View className="flex-row gap-2">
            {STAKE_TERMS.map((term, i) => (
              <Button
                key={term.days}
                className="flex-1"
                size="sm"
                variant={i === stakeTermIndex ? 'primary' : 'secondary'}
                onPress={() => setStakeTermIndex(i)}
              >
                {term.label}
              </Button>
            ))}
          </View>
          <Text className="text-xs text-muted">{STAKE_TERMS[stakeTermIndex].perk}</Text>
          <Button disabled={!canSubmitAmount} loading={stakeTC.isPending} onPress={handleStake}>
            Застейкать
          </Button>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
