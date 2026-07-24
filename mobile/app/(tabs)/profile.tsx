import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Crown, Receipt, Settings, Sparkles, Star, Coins } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedRef,
  useAnimatedStyle,
  useScrollViewOffset,
} from 'react-native-reanimated';

import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { Avatar } from '@/components/Avatar';
import { StatsGrid } from '@/components/StatsGrid';
import { EmptyState } from '@/components/EmptyState';

import { useAuthStore } from '@/store/authStore';
import { useLeaderboardQuery } from '@/hooks/useLeaderboardQuery';
import { useTransactionsQuery } from '@/hooks/useTransactionsQuery';
import { useArtifactsQuery } from '@/hooks/useArtifactsQuery';
import { groupByDate } from '@/lib/date-groups';
import { colors } from '@/design-system/colors';

const TOP_N = 5;
const HEADER_SHRINK_RANGE = 100;

export default function ProfileScreen() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const toast = useToast();
  const [loggingOut, setLoggingOut] = useState(false);

  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollY = useScrollViewOffset(scrollRef);

  const headerStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(scrollY.value, [0, HEADER_SHRINK_RANGE], [1, 0.92], Extrapolation.CLAMP) },
    ],
    opacity: interpolate(scrollY.value, [0, HEADER_SHRINK_RANGE], [1, 0.9], Extrapolation.CLAMP),
  }));

  const avatarStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(scrollY.value, [0, HEADER_SHRINK_RANGE], [1, 0.72], Extrapolation.CLAMP) },
    ],
  }));

  const { data: leaderboard, isLoading: leaderboardLoading, isFetching: leaderboardFetching, refetch: refetchLeaderboard } =
    useLeaderboardQuery();
  const { data: transactions, isFetching: txFetching, refetch: refetchTransactions } = useTransactionsQuery();
  const { data: artifacts } = useArtifactsQuery();

  const topArchitects = useMemo(() => (leaderboard ?? []).slice(0, TOP_N), [leaderboard]);
  const myRank = useMemo(() => {
    if (!leaderboard || !user) return null;
    const idx = leaderboard.findIndex((e) => e.userId === user.id);
    return idx >= 0 ? idx + 1 : null;
  }, [leaderboard, user]);
  const myEntry = useMemo(
    () => leaderboard?.find((e) => e.userId === user?.id) ?? null,
    [leaderboard, user],
  );

  const recentTransactions = useMemo(() => (transactions ?? []).slice(0, 15), [transactions]);
  const transactionGroups = useMemo(
    () => groupByDate(recentTransactions, (tx) => tx.createdAt),
    [recentTransactions],
  );

  // "TC заработано" считаем как сумму положительных транзакций в timecoin —
  // отдельного агрегированного поля на бэкенде нет.
  const tcEarned = useMemo(
    () =>
      (transactions ?? [])
        .filter((tx) => tx.currency === 'timecoin' && tx.amount > 0)
        .reduce((sum, tx) => sum + tx.amount, 0),
    [transactions],
  );

  const handleShareReferral = async () => {
    if (!user?.referralCode) return;
    await Clipboard.setStringAsync(user.referralCode);
    toast.show('Реферальный код скопирован', 'success');
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    await logout();
    router.replace('/(auth)/login');
  };

  if (leaderboardLoading) {
    return <Spinner fullscreen />;
  }

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top']}>
      <Animated.ScrollView
        ref={scrollRef}
        scrollEventThrottle={16}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        refreshControl={
          <RefreshControl
            refreshing={leaderboardFetching || txFetching}
            onRefresh={() => {
              refetchLeaderboard();
              refetchTransactions();
            }}
          />
        }
      >
        <View className="flex-row items-center justify-between">
          <Text className="text-2xl font-bold text-white">Профиль</Text>
          <Pressable onPress={() => router.push('/settings')} hitSlop={8}>
            <Settings size={24} color="#8A8A9A" />
          </Pressable>
        </View>

        <Animated.View style={headerStyle}>
          <Card className="flex-row items-center gap-3">
            <Animated.View style={avatarStyle}>
              <Avatar name={user?.username ?? 'Гость'} size={64} rank={myRank} />
            </Animated.View>
            <View className="flex-1 gap-1">
              <Text className="text-lg font-bold text-white">{user?.username ?? 'Гость'}</Text>
              {user?.email ? <Text className="text-muted">{user.email}</Text> : null}
              {myRank ? (
                <View className="mt-1 flex-row items-center gap-1.5">
                  <Crown size={16} color="#F1C40F" />
                  <Text className="text-sm text-muted">Место в рейтинге: #{myRank}</Text>
                </View>
              ) : null}
            </View>
          </Card>
        </Animated.View>

        <StatsGrid
          stats={[
            { icon: Sparkles, value: String(artifacts?.length ?? 0), label: 'Артефактов' },
            { icon: Star, value: String(myEntry?.level ?? 1), label: 'Уровень', color: '#D4AF37' },
            { icon: Coins, value: String(tcEarned), label: 'TC заработано', color: colors.cyan },
          ]}
        />

        {user?.referralCode ? (
          <Card className="gap-2">
            <Text className="text-muted">Реферальный код</Text>
            <View className="flex-row items-center justify-between">
              <Text className="text-lg font-bold text-accent">{user.referralCode}</Text>
              <Button size="sm" variant="secondary" onPress={handleShareReferral}>
                Копировать
              </Button>
            </View>
          </Card>
        ) : null}

        <Card className="gap-3">
          <Text className="text-lg font-bold text-white">Топ архитекторов</Text>
          {topArchitects.length === 0 ? (
            <Text className="text-muted">Рейтинг пока пуст</Text>
          ) : (
            topArchitects.map((entry, i) => (
              <View key={entry.userId} className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-2">
                  <Text className="w-5 text-center text-muted">{i + 1}</Text>
                  <Text className="font-semibold text-white">{entry.displayName ?? entry.username}</Text>
                </View>
                <Text className="text-sm text-muted">Ур. {entry.level}</Text>
              </View>
            ))
          )}
        </Card>

        <Card className="gap-3">
          <Text className="text-lg font-bold text-white">Последние операции</Text>
          {recentTransactions.length === 0 ? (
            <EmptyState icon={Receipt} title="Операций пока нет" style={{ paddingVertical: 8 }} />
          ) : (
            transactionGroups.map((group) => (
              <View key={group.label} className="gap-2">
                <Text className="text-xs font-semibold uppercase text-muted">{group.label}</Text>
                {group.items.map((tx) => (
                  <View key={tx.id} className="flex-row items-center justify-between">
                    <Text className="text-white">{tx.item ?? tx.type}</Text>
                    <Text className={tx.amount >= 0 ? 'text-up' : 'text-down'}>
                      {tx.amount >= 0 ? '+' : ''}
                      {tx.amount} {tx.currency}
                    </Text>
                  </View>
                ))}
              </View>
            ))
          )}
        </Card>

        <Button variant="danger" loading={loggingOut} onPress={handleLogout}>
          Выйти
        </Button>
      </Animated.ScrollView>
    </SafeAreaView>
  );
}
