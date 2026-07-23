import { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import Svg, { Line, Polyline } from 'react-native-svg';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { historyFor, pctChange, UP, DOWN, type PricePoint, type Timeframe } from '@/lib/tc-market';

const TF_LABELS: Record<Timeframe, string> = {
  day: '1Д',
  week: '1Н',
  month: '1М',
  year: '1Г',
};

const TF_ORDER: Timeframe[] = ['day', 'week', 'month', 'year'];
const CHART_HEIGHT = 100;

function buildPoints(prices: number[], width: number, height: number): string {
  if (prices.length === 0) return '';
  if (prices.length === 1) return `0,${height / 2} ${width},${height / 2}`;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const step = width / (prices.length - 1);
  return prices
    .map((p, i) => {
      const x = i * step;
      const y = height - ((p - min) / range) * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}

export function PriceChart({ history }: { history: PricePoint[] }) {
  const [tf, setTf] = useState<Timeframe>('month');
  const [width, setWidth] = useState(0);

  const points = useMemo(() => historyFor(history, tf), [history, tf]);
  const prices = useMemo(() => points.map((p) => p.price), [points]);
  const change = useMemo(() => {
    if (prices.length < 2) return 0;
    return pctChange(prices[0], prices[prices.length - 1]);
  }, [prices]);
  const color = change >= 0 ? UP : DOWN;
  const polyline = useMemo(() => buildPoints(prices, width, CHART_HEIGHT), [prices, width]);

  const chartOpacity = useSharedValue(1);
  useEffect(() => {
    chartOpacity.value = 0;
    chartOpacity.value = withTiming(1, { duration: 280 });
  }, [tf, polyline]);
  const chartStyle = useAnimatedStyle(() => ({ opacity: chartOpacity.value }));

  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between">
        <Text className="text-muted">График цены TC</Text>
        <Text style={{ color }} className="text-sm font-bold">
          {change >= 0 ? '+' : ''}
          {change.toFixed(2)}%
        </Text>
      </View>
      <View
        style={{ height: CHART_HEIGHT }}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      >
        {width > 0 && prices.length > 0 ? (
          <Animated.View style={chartStyle}>
            <Svg width={width} height={CHART_HEIGHT}>
              <Line
                x1={0}
                y1={CHART_HEIGHT / 2}
                x2={width}
                y2={CHART_HEIGHT / 2}
                stroke="#2A2A3A"
                strokeWidth={1}
                strokeDasharray="4,4"
              />
              <Polyline points={polyline} fill="none" stroke={color} strokeWidth={2} />
            </Svg>
          </Animated.View>
        ) : null}
      </View>
      <View className="flex-row gap-2">
        {TF_ORDER.map((k) => (
          <Text
            key={k}
            onPress={() => setTf(k)}
            className={
              k === tf
                ? 'rounded-full bg-accent px-3 py-1 text-xs font-bold text-black'
                : 'rounded-full px-3 py-1 text-xs text-muted'
            }
          >
            {TF_LABELS[k]}
          </Text>
        ))}
      </View>
    </View>
  );
}
