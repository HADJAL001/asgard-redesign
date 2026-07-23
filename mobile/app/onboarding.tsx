import { useRef, useState } from 'react';
import { Dimensions, FlatList, Pressable, Text, View, type ListRenderItemInfo, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Sparkles, Wallet, Shield } from 'lucide-react-native';

import { useOnboardingStore } from '@/store/onboardingStore';

const { width } = Dimensions.get('window');

type Slide = {
  key: string;
  title: string;
  description: string;
  Icon: typeof Sparkles;
};

const SLIDES: Slide[] = [
  {
    key: 'create',
    title: 'Создавайте артефакты',
    description: 'Генерируйте уникальные цифровые артефакты силой ИИ прямо в приложении.',
    Icon: Sparkles,
  },
  {
    key: 'wallet',
    title: 'Копите TimeCoin',
    description: 'Зарабатывайте и тратьте внутреннюю валюту OSGARD на генерации и апгрейды.',
    Icon: Wallet,
  },
  {
    key: 'secure',
    title: 'Ваш аккаунт под защитой',
    description: 'Вход по биометрии и безопасная авторизация через Google и GitHub.',
    Icon: Shield,
  },
];

export default function OnboardingScreen() {
  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList<Slide>>(null);
  const markSeen = useOnboardingStore((s) => s.markSeen);

  const isLast = index === SLIDES.length - 1;

  const finish = async () => {
    await markSeen();
    router.replace('/(auth)/login');
  };

  const handleNext = () => {
    if (isLast) {
      finish();
      return;
    }
    listRef.current?.scrollToIndex({ index: index + 1, animated: true });
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / width);
    if (next !== index) setIndex(next);
  };

  const renderItem = ({ item }: ListRenderItemInfo<Slide>) => (
    <View style={{ width }} className="flex-1 items-center justify-center gap-6 px-8">
      <View className="h-24 w-24 items-center justify-center rounded-full bg-card">
        <item.Icon size={40} color="#00D4FF" />
      </View>
      <Text className="text-center text-2xl font-bold text-white">{item.title}</Text>
      <Text className="text-center text-base text-muted">{item.description}</Text>
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="flex-row justify-end px-6 pt-2">
        <Pressable onPress={finish}>
          <Text className="text-sm text-muted">Пропустить</Text>
        </Pressable>
      </View>

      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
        className="flex-1"
      />

      <View className="flex-row justify-center gap-2 pb-4">
        {SLIDES.map((slide, i) => (
          <View
            key={slide.key}
            className={`h-2 w-2 rounded-full ${i === index ? 'bg-accent' : 'bg-border'}`}
          />
        ))}
      </View>

      <View className="px-6 pb-6">
        <Pressable onPress={handleNext} className="items-center rounded-xl bg-accent px-4 py-4">
          <Text className="text-base font-bold text-bg">{isLast ? 'Начать' : 'Далее'}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
