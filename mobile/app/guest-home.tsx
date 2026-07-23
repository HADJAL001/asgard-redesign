import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Sparkles } from 'lucide-react-native';

import { useGuestStore, GUEST_FREE_GENERATIONS } from '@/store/guestStore';
import { generateDemoProject, type DemoGenerateResponse } from '@/lib/demo-api';
import { ApiError } from '@/lib/api-client';

export default function GuestHomeScreen() {
  const [name, setName] = useState('');
  const [hint, setHint] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DemoGenerateResponse | null>(null);

  const generationsUsed = useGuestStore((s) => s.generationsUsed);
  const canGenerate = useGuestStore((s) => s.canGenerate());
  const recordGeneration = useGuestStore((s) => s.recordGeneration);

  const remaining = Math.max(0, GUEST_FREE_GENERATIONS - generationsUsed);
  const canSubmit = canGenerate && name.trim().length > 0 && !loading;

  const handleGenerate = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    try {
      const data = await generateDemoProject(name.trim(), hint.trim() || undefined);
      setResult(data);
      await recordGeneration({
        name: data.project.name,
        description: data.project.description,
        badge: data.project.badge,
        artifacts: data.artifacts,
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не удалось сгенерировать вселенную');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} keyboardShouldPersistTaps="handled">
        <View className="gap-1">
          <Text className="text-2xl font-bold text-white">Гостевой режим</Text>
          <Text className="text-muted">
            Осталось бесплатных генераций: {remaining}/{GUEST_FREE_GENERATIONS}
          </Text>
        </View>

        {canGenerate ? (
          <View className="gap-3">
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Название вселенной"
              placeholderTextColor="#8A8A9A"
              className="rounded-xl border border-border bg-card px-4 py-3 text-white"
            />
            <TextInput
              value={hint}
              onChangeText={setHint}
              placeholder="Подсказка (необязательно)"
              placeholderTextColor="#8A8A9A"
              multiline
              numberOfLines={3}
              className="min-h-[80px] rounded-xl border border-border bg-card px-4 py-3 text-white"
              textAlignVertical="top"
            />
            {error && <Text className="text-sm text-down">{error}</Text>}
            <Pressable
              onPress={handleGenerate}
              disabled={!canSubmit}
              className={`flex-row items-center justify-center gap-2 rounded-xl px-4 py-4 ${
                canSubmit ? 'bg-accent' : 'bg-border'
              }`}
            >
              <Sparkles size={18} color={canSubmit ? '#0A0A0F' : '#8A8A9A'} />
              <Text className={`text-base font-bold ${canSubmit ? 'text-bg' : 'text-muted'}`}>
                {loading ? 'Генерируем…' : 'Сгенерировать'}
              </Text>
            </Pressable>
          </View>
        ) : (
          <View className="gap-3 rounded-xl border border-border bg-card p-4">
            <Text className="text-base text-white">
              Бесплатные генерации закончились. Зарегистрируйтесь, чтобы продолжить — все ваши
              демо-вселенные перенесутся на новый аккаунт.
            </Text>
            <Pressable
              onPress={() => router.push('/(auth)/register')}
              className="items-center rounded-xl bg-accent px-4 py-3"
            >
              <Text className="text-base font-bold text-bg">Зарегистрироваться</Text>
            </Pressable>
          </View>
        )}

        {result && (
          <View className="gap-2 rounded-xl border border-border bg-card p-4">
            <Text className="text-lg font-bold text-white">{result.project.name}</Text>
            <Text className="text-sm text-muted">{result.project.description}</Text>
            {result.artifacts.map((artifact) => (
              <View key={artifact.id} className="flex-row items-center justify-between border-t border-border pt-2">
                <Text className="text-white">{artifact.name}</Text>
                <Text className="text-muted">{artifact.rarity}</Text>
              </View>
            ))}
          </View>
        )}

        <Pressable onPress={() => router.push('/(auth)/login')}>
          <Text className="text-center text-sm text-muted">Уже есть аккаунт? Войти</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
