import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { PiggyBank } from 'lucide-react-native';

import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { PriceChart } from '@/components/PriceChart';
import { BalanceCard, type BalanceRow } from '@/components/BalanceCard';
import { CurrencyIcon } from '@/components/CurrencyIcon';
import { LoadingAnimation } from '@/components/LoadingAnimation';
import { EmptyState } from '@/components/EmptyState';
import { OrderBook } from '@/components/OrderBook';
import { MyOrders } from '@/components/MyOrders';

import { useWalletQuery } from '@/hooks/useWalletQuery';
import { useTcMarketQuery } from '@/hooks/useTcMarketQuery';
import { useMarketBuyMutation } from '@/hooks/useMarketBuyMutation';
import { useMarketSellMutation } from '@/hooks/useMarketSellMutation';
import { useCreateOrderMutation } from '@/hooks/useCreateOrderMutation';
import { useStakesQuery } from '@/hooks/useStakesQuery';
import { useStakeMutation } from '@/hooks/useStakeMutation';
import { useUnstakeMutation } from '@/hooks/useUnstakeMutation';

import { CURRENCY_ORDER, CURRENCIES, formatCurrencyAmount } from '@/lib/economy';
import { STAKE_TERMS, MIN_STAKE, fmtUSD, fmtTC } from '@/lib/tc-market';
import { ApiError } from '@/lib/api-client';

type ActiveModal = 'buy' | 'sell' | 'stake' | null;

export default function WalletScreen() {
  const { data: wallet, isLoading: walletLoading, isFetching: walletFetching, refetch: refetchWallet } = useWalletQuery();
  const { data: tcState, isFetching: tcFetching, refetch: refetchTcState } = useTcMarketQuery();
  const { data: stakes, isFetching: stakesFetching, refetch: refetchStakes } = useStakesQuery();

  const marketBuy = useMarketBuyMutation();
  const marketSell = useMarketSellMutation();
  const createOrder = useCreateOrderMutation();
  const stakeTC = useStakeMutation();
  const unstakeTC = useUnstakeMutation();

  const toast = useToast();
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [amount, setAmount] = useState('');
  const [orderKind, setOrderKind] = useState<'market' | 'limit'>('market');
  const [limitPrice, setLimitPrice] = useState('');
  const [stakeTermIndex, setStakeTermIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const isRefreshing = walletFetching || tcFetching || stakesFetching;
  const activeStakes = useMemo(() => (stakes ?? []).filter((s) => s.status === 'active'), [stakes]);

  const balanceRows = useMemo<BalanceRow[]>(
    () => [
      ...CURRENCY_ORDER.map((id) => ({
        key: id,
        icon: <CurrencyIcon currency={id} />,
        label: CURRENCIES[id].label,
        value: wallet?.[id] ?? 0,
        format: (n: number) => formatCurrencyAmount(id, n),
        suffix: CURRENCIES[id].symbol,
      })),
      {
        key: 'usd',
        icon: <CurrencyIcon currency="usd" />,
        label: 'USD-баланс',
        value: wallet?.cash_usd ?? 0,
        format: (n: number) => fmtUSD(n),
        dividerAbove: true,
      },
    ],
    [wallet],
  );

  const closeModal = () => {
    setActiveModal(null);
    setAmount('');
    setLimitPrice('');
    setOrderKind('market');
    setError(null);
  };

  const handleRefresh = () => {
    refetchWallet();
    refetchTcState();
    refetchStakes();
  };

  const parsedAmount = Number(amount.replace(',', '.'));
  const canSubmitAmount = amount.trim().length > 0 && parsedAmount > 0;

  const parsedLimitPrice = Number(limitPrice.replace(',', '.'));
  const canSubmitLimit = canSubmitAmount && limitPrice.trim().length > 0 && parsedLimitPrice > 0;

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

  const handleLimitOrder = async (side: 'buy' | 'sell') => {
    if (!canSubmitLimit) return;
    try {
      await createOrder.mutateAsync({ side, price: parsedLimitPrice, amount: parsedAmount });
      toast.show(side === 'buy' ? 'Заявка на покупку выставлена' : 'Заявка на продажу выставлена', 'success');
      closeModal();
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : 'Не удалось выставить заявку', 'error');
    }
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
    return (
      <SafeAreaView className="flex-1 bg-bg" edges={['top']}>
        <LoadingAnimation label="Загрузка кошелька" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top']}>
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 12 }}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
      >
        <Text className="text-2xl font-bold text-white">Кошелёк</Text>

        <BalanceCard rows={balanceRows} />

        <Card className="gap-3">
          <View className="flex-row items-center justify-between">
            <Text className="text-muted">Курс TimeCoin</Text>
            <Text className="text-lg font-bold text-accent">{fmtUSD(tcState?.price ?? 0)}</Text>
          </View>
          <PriceChart history={tcState?.history ?? []} />
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
          <Text className="text-lg font-bold text-white">Действия</Text>
          <Button variant="secondary" onPress={() => router.push('/wallet/transfer')}>
            Перевести TimeCoin
          </Button>
        </Card>

        <Card className="gap-3">
          <Text className="text-lg font-bold text-white">Стакан заявок</Text>
          <OrderBook />
        </Card>

        <Card className="gap-3">
          <Text className="text-lg font-bold text-white">Мои заявки</Text>
          <MyOrders />
        </Card>

        <Card className="gap-3">
          <View className="flex-row items-center justify-between">
            <Text className="text-lg font-bold text-white">Стейкинг</Text>
            <Button size="sm" variant="secondary" onPress={() => setActiveModal('stake')}>
              + Открыть стейк
            </Button>
          </View>
          {activeStakes.length === 0 ? (
            <EmptyState
              icon={PiggyBank}
              title="Нет активных стейков"
              description="Застейкайте TimeCoin, чтобы получать пассивный доход"
              actionLabel="Открыть стейк"
              onAction={() => setActiveModal('stake')}
              style={{ paddingVertical: 8 }}
            />
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
          <View className="flex-row gap-2">
            <Button
              className="flex-1"
              size="sm"
              variant={orderKind === 'market' ? 'primary' : 'secondary'}
              onPress={() => setOrderKind('market')}
            >
              Рынок
            </Button>
            <Button
              className="flex-1"
              size="sm"
              variant={orderKind === 'limit' ? 'primary' : 'secondary'}
              onPress={() => setOrderKind('limit')}
            >
              Лимит
            </Button>
          </View>
          {orderKind === 'limit' && (
            <Input
              label="Цена за ∞ в USD"
              keyboardType="decimal-pad"
              value={limitPrice}
              onChangeText={setLimitPrice}
              placeholder={fmtUSD(0)}
            />
          )}
          <Input
            label={orderKind === 'market' ? 'Сумма в USD' : 'Количество TimeCoin'}
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={setAmount}
            placeholder="0.00"
          />
          {orderKind === 'market' ? (
            <Button disabled={!canSubmitAmount} loading={marketBuy.isPending} onPress={handleBuy}>
              Купить
            </Button>
          ) : (
            <Button disabled={!canSubmitLimit} loading={createOrder.isPending} onPress={() => handleLimitOrder('buy')}>
              Выставить заявку
            </Button>
          )}
        </View>
      </Modal>

      <Modal visible={activeModal === 'sell'} onClose={closeModal} title="Продать TimeCoin">
        <View className="gap-3">
          <View className="flex-row gap-2">
            <Button
              className="flex-1"
              size="sm"
              variant={orderKind === 'market' ? 'primary' : 'secondary'}
              onPress={() => setOrderKind('market')}
            >
              Рынок
            </Button>
            <Button
              className="flex-1"
              size="sm"
              variant={orderKind === 'limit' ? 'primary' : 'secondary'}
              onPress={() => setOrderKind('limit')}
            >
              Лимит
            </Button>
          </View>
          {orderKind === 'limit' && (
            <Input
              label="Цена за ∞ в USD"
              keyboardType="decimal-pad"
              value={limitPrice}
              onChangeText={setLimitPrice}
              placeholder={fmtUSD(0)}
            />
          )}
          <Input
            label={orderKind === 'market' ? `Сумма в ${fmtTC(0).split(' ')[1]}` : 'Количество TimeCoin'}
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={setAmount}
            placeholder="0.00"
          />
          {orderKind === 'market' ? (
            <Button disabled={!canSubmitAmount} loading={marketSell.isPending} onPress={handleSell}>
              Продать
            </Button>
          ) : (
            <Button disabled={!canSubmitLimit} loading={createOrder.isPending} onPress={() => handleLimitOrder('sell')}>
              Выставить заявку
            </Button>
          )}
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
