import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowRight, Sparkles } from 'lucide-react-native';

import { useAuthStore } from '@/store/authStore';

export default function GuestHomeScreen() {
  const [name, setName] = useState('');
  const [hint, setHint] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startGuest = useAuthStore((state) => state.startGuest);

  const canSubmit = name.trim().length > 0 && hint.trim().length > 0 && !loading;

  const beginProject = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    const result = await startGuest();
    setLoading(false);
    if (!result.ok) {
      setError(result.message ?? 'Не удалось начать гостевую сессию');
      return;
    }
    router.replace({ pathname: '/(tabs)', params: { name: name.trim(), hint: hint.trim() } });
  };

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <ScrollView contentContainerStyle={{ padding: 20, gap: 18 }} keyboardShouldPersistTaps="handled">
        <View className="gap-2">
          <Text className="text-xs font-semibold uppercase tracking-[2px] text-accent">OSGARD NEW WORLD</Text>
          <Text className="text-3xl font-bold text-white">Создайте первый проект</Text>
          <Text className="text-sm leading-5 text-muted">
            Начните без регистрации. OSGARD уточнит задачу в интервью и только затем соберёт настоящий проект.
          </Text>
        </View>

        <View className="gap-3 rounded-2xl border border-accent/30 bg-card p-4">
          <View className="flex-row items-center gap-2">
            <Sparkles size={18} color="#00F0FF" />
            <Text className="text-base font-semibold text-white">Ваш проект остаётся вашим</Text>
          </View>
          <Text className="text-sm leading-5 text-muted">
            После регистрации проект и результаты работы будут перенесены в ваш постоянный аккаунт.
          </Text>
        </View>

        <View className="gap-2">
          <Text className="text-sm font-semibold text-muted">Название</Text>
          <TextInput value={name} onChangeText={setName} placeholder="Например, FocusFlow" placeholderTextColor="#77809A" maxLength={120} className="rounded-xl border border-border bg-card px-4 py-3 text-white" />
        </View>

        <View className="gap-2">
          <Text className="text-sm font-semibold text-muted">Идея проекта</Text>
          <TextInput value={hint} onChangeText={setHint} placeholder="Для кого продукт, какую задачу решает и что должно получиться" placeholderTextColor="#77809A" multiline numberOfLines={6} maxLength={2000} className="min-h-[140px] rounded-xl border border-border bg-card px-4 py-3 text-white" textAlignVertical="top" />
        </View>

        {error ? <Text className="text-sm text-down">{error}</Text> : null}

        <Pressable onPress={beginProject} disabled={!canSubmit} accessibilityRole="button" accessibilityState={{ disabled: !canSubmit }} className={`flex-row items-center justify-center gap-2 rounded-xl px-4 py-4 ${canSubmit ? 'bg-accent' : 'bg-border'}`}>
          <Text className={`text-base font-bold ${canSubmit ? 'text-bg' : 'text-muted'}`}>{loading ? 'Подготавливаем проект...' : 'Перейти к интервью'}</Text>
          <ArrowRight size={18} color={canSubmit ? '#07111F' : '#77809A'} />
        </Pressable>

        <Pressable onPress={() => router.push('/(auth)/login')}>
          <Text className="text-center text-sm text-muted">Уже есть аккаунт? Войти</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
