import { useMemo } from 'react';
import { Text, View } from 'react-native';

import { useOrderBookQuery } from '@/hooks/useOrderBookQuery';
import { fmtUSD, UP, DOWN } from '@/lib/tc-market';
import type { OrderBookLevel } from '@/types/market';

type Row = OrderBookLevel & { total: number };

function withCumulativeTotal(levels: OrderBookLevel[]): Row[] {
  return levels.reduce<Row[]>((acc, level) => {
    const prevTotal = acc.length > 0 ? acc[acc.length - 1].total : 0;
    return [...acc, { ...level, total: prevTotal + level.amount }];
  }, []);
}

function BookLine({ price, amount, total, max, color }: { price: number; amount: number; total: number; max: number; color: string }) {
  const pct = Math.min(100, (total / max) * 100);
  return (
    <View className="flex-row items-center justify-between py-1">
      <View className="absolute inset-y-0 right-0 rounded-sm" style={{ width: `${pct}%`, backgroundColor: color, opacity: 0.08 }} />
      <Text className="text-xs" style={{ color }}>{fmtUSD(price)}</Text>
      <Text className="text-xs text-white">{amount.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}</Text>
      <Text className="text-xs text-muted">{total.toLocaleString('ru-RU', { maximumFractionDigits: 0 })}</Text>
    </View>
  );
}

export function OrderBook() {
  const { data: orderBook } = useOrderBookQuery();

  const bidRows = useMemo(() => withCumulativeTotal(orderBook?.bids ?? []), [orderBook]);
  const askRows = useMemo(() => withCumulativeTotal(orderBook?.asks ?? []), [orderBook]);
  const maxTotal = useMemo(() => {
    const totals = [...bidRows, ...askRows].map((r) => r.total);
    return Math.max(1, ...totals);
  }, [bidRows, askRows]);

  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between px-0.5">
        <Text className="text-[11px] uppercase text-muted">Цена</Text>
        <Text className="text-[11px] uppercase text-muted">Объём</Text>
        <Text className="text-[11px] uppercase text-muted">Всего</Text>
      </View>

      <View>
        {askRows.length === 0 ? (
          <Text className="py-2 text-center text-xs text-muted">Нет заявок на продажу</Text>
        ) : (
          [...askRows].reverse().map((r, i) => <BookLine key={`a${i}`} price={r.price} amount={r.amount} total={r.total} max={maxTotal} color={DOWN} />)
        )}
      </View>

      {orderBook && (
        <View className="items-center border-y border-border py-1">
          <Text className="text-xs font-semibold text-white">Спред: {fmtUSD(orderBook.spread)}</Text>
        </View>
      )}

      <View>
        {bidRows.length === 0 ? (
          <Text className="py-2 text-center text-xs text-muted">Нет заявок на покупку</Text>
        ) : (
          bidRows.map((r, i) => <BookLine key={`b${i}`} price={r.price} amount={r.amount} total={r.total} max={maxTotal} color={UP} />)
        )}
      </View>
    </View>
  );
}
