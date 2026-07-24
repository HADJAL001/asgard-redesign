import { useMemo } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useUserOrdersQuery } from '@/hooks/useUserOrdersQuery';
import { useCancelOrderMutation } from '@/hooks/useCancelOrderMutation';
import { fmtUSD, UP, DOWN } from '@/lib/tc-market';
import { ApiError } from '@/lib/api-client';

const ORDER_STATUS_LABEL: Record<string, string> = {
  open: 'Открыта',
  partial: 'Частично исполнена',
  filled: 'Исполнена',
  cancelled: 'Отменена',
};

export function MyOrders() {
  const { data: orders } = useUserOrdersQuery();
  const cancelOrder = useCancelOrderMutation();
  const toast = useToast();

  const openCount = useMemo(
    () => (orders ?? []).filter((o) => o.status === 'open' || o.status === 'partial').length,
    [orders],
  );

  const handleCancel = async (orderId: number) => {
    try {
      await cancelOrder.mutateAsync(orderId);
      toast.show('Заявка отменена', 'success');
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : 'Не удалось отменить заявку', 'error');
    }
  };

  if (!orders || orders.length === 0) {
    return <Text className="py-2 text-center text-sm text-muted">Нет заявок</Text>;
  }

  return (
    <View className="gap-2">
      {orders.map((o) => {
        const cancellable = o.status === 'open' || o.status === 'partial';
        return (
          <View key={o.id} className="flex-row items-center justify-between rounded-xl border border-border bg-bg px-3 py-2">
            <View className="gap-0.5">
              <Text style={{ color: o.side === 'buy' ? UP : DOWN }} className="text-sm font-semibold">
                {o.side === 'buy' ? 'Покупка' : 'Продажа'} · {fmtUSD(o.price)}
              </Text>
              <Text className="text-xs text-muted">
                {o.filledAmount.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} / {o.amount.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ∞ · {ORDER_STATUS_LABEL[o.status] ?? o.status}
              </Text>
            </View>
            {cancellable ? (
              <Button size="sm" variant="danger" loading={cancelOrder.isPending} onPress={() => handleCancel(o.id)}>
                Отменить
              </Button>
            ) : null}
          </View>
        );
      })}
      {openCount > 0 && <Text className="text-xs text-muted">Открытых заявок: {openCount}</Text>}
    </View>
  );
}
