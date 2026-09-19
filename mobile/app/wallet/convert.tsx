import { ScrollView, Text } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

export default function EconomyRulesScreen() {
  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Card className="gap-3">
          <Text className="text-xl font-bold text-white">Правила экономики</Text>
          <Text className="text-sm leading-6 text-muted">
            Credits выдаются за активность и используются для генераций и материалов Кузницы. Их нельзя обменять или вывести.
          </Text>
          <Text className="text-sm leading-6 text-muted">
            Shards и Crystals - материалы для рецептов Кузницы, а не валюты. TimeCoin покупается и продается на бирже, используется на Маркетплейсе, в стейкинге и для вывода.
          </Text>
          <Button onPress={() => router.replace('/(tabs)/wallet')}>Вернуться к кошельку</Button>
          <Button variant="secondary" onPress={() => router.push('/(tabs)/marketplace')}>Открыть Маркетплейс</Button>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
