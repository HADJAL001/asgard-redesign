import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Crown } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';

import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';

import { useAuthStore } from '@/store/authStore';
import { useLeaderboardQuery } from '@/hooks/useLeaderboardQuery';
import { useTransactionsQuery } from '@/hooks/useTransactionsQuery';

const TOP_N = 5;

export default function ProfileScreen() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const toast = useToast();
  const [loggingOut, setLoggingOut] = useState(false);

  const { data: leaderboard, isLoading: leaderboardLoading, isFetching: leaderboardFetching, refetch: refetchLeaderboard } =
    useLeaderboardQuery();
  const { data: transactions, isFetching: txFetching, refetch: refetchTransactions } = useTransactionsQuery();

  const topArchitects = useMemo(() => (leaderboard ?? []).slice(0, TOP_N), [leaderboard]);
  const myRank = useMemo(() => {
    if (!leaderboard || !user) return null;
    const idx = leaderboard.findIndex((e) => e.userId === user.id);
    return idx >= 0 ? idx + 1 : null;
  }, [leaderboard, user]);

  const recentTransactions = useMemo(() => (transactions ?? []).slice(0, 5), [transactions]);

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
      <ScrollView
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
        <Text className="text-2xl font-bold text-white">Профиль</Text>

        <Card className="gap-2">
          <Text className="text-lg font-bold text-white">{user?.username ?? 'Гость'}</Text>
          {user?.email ? <Text className="text-muted">{user.email}</Text> : null}
          {myRank ? (
            <View className="mt-1 flex-row items-center gap-1.5">
              <Crown size={16} color="#F1C40F" />
              <Text className="text-sm text-muted">Место в рейтинге: #{myRank}</Text>
            </View>
          ) : null}
        </Card>

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
            <Text className="text-muted">Операций пока нет</Text>
          ) : (
            recentTransactions.map((tx) => (
              <View key={tx.id} className="flex-row items-center justify-between">
                <Text className="text-white">{tx.item ?? tx.type}</Text>
                <Text className={tx.amount >= 0 ? 'text-up' : 'text-down'}>
                  {tx.amount >= 0 ? '+' : ''}
                  {tx.amount} {tx.currency}
                </Text>
              </View>
            ))
          )}
        </Card>

        <Button variant="danger" loading={loggingOut} onPress={handleLogout}>
          Выйти
        </Button>
      </ScrollView>
    </SafeAreaView>
  );
}
