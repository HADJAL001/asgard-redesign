import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { CheckCircle2, CircleDashed, Layers3, WandSparkles, XCircle } from 'lucide-react-native';

import { VoiceInputButton } from '@/components/VoiceInputButton';
import { useVoiceInput } from '@/hooks/useVoiceInput';
import { useProjectsQuery, PROJECTS_QUERY_KEY } from '@/hooks/useProjectsQuery';
import { createProject } from '@/lib/projects-api';
import { ApiError } from '@/lib/api-client';
import { queryClient } from '@/lib/queryClient';

type Depth = 'quick' | 'standard' | 'deep';

const DEPTHS: { value: Depth; label: string; note: string }[] = [
  { value: 'quick', label: 'Быстро', note: 'шаблон + проверка' },
  { value: 'standard', label: 'Стандарт', note: 'полное приложение' },
  { value: 'deep', label: 'Глубоко', note: 'расширенная проверка' },
];

export default function CreateScreen() {
  const [name, setName] = useState('');
  const [hint, setHint] = useState('');
  const [depth, setDepth] = useState<Depth>('standard');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const voice = useVoiceInput((transcript) => setHint((prev) => (prev ? `${prev} ${transcript}` : transcript)));
  const { data: projects } = useProjectsQuery();
  const active = projects?.find((project) => project.status === 'generating');

  const submit = useCallback(async () => {
    if (!hint.trim() || busy) return;
    setBusy(true);
    setError(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const project = await createProject({ name, hint, depth });
      await queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY });
      router.push(`/project/${project.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не удалось запустить создание проекта');
    } finally {
      setBusy(false);
    }
  }, [busy, depth, hint, name]);

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <ScrollView contentContainerStyle={{ padding: 20, gap: 18 }} keyboardShouldPersistTaps="handled">
        <View className="gap-1">
          <Text className="text-xs font-semibold uppercase tracking-[2px] text-accent">OSGARD NEW WORLD</Text>
          <Text className="text-3xl font-bold text-white">Создать приложение</Text>
          <Text className="text-sm leading-5 text-muted">Опишите идею. Платформа спланирует продукт, соберёт код и проверит результат.</Text>
        </View>

        <View className="gap-3 rounded-2xl border border-accent/30 bg-card px-4 py-4">
          <View className="flex-row items-center gap-2">
            <Layers3 size={17} color="#00F0FF" />
            <Text className="text-sm font-semibold text-white">Контур сборки</Text>
          </View>
          <Text className="text-xs leading-5 text-muted">OSGARD 5.0 / 4.8 — план и проверка  ·  OSGARD 4.0 — код  ·  инженерный контроль</Text>
        </View>

        {active && (
          <Pressable onPress={() => router.push(`/project/${active.id}`)} className="flex-row items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
            <CircleDashed size={18} color="#F5C451" />
            <View className="flex-1">
              <Text className="text-sm font-semibold text-white">Проект уже собирается</Text>
              <Text className="text-xs text-muted">Открыть «{active.name}»</Text>
            </View>
          </Pressable>
        )}

        <View className="gap-2">
          <Text className="text-sm font-semibold text-muted">Название</Text>
          <TextInput value={name} onChangeText={setName} placeholder="Например, FocusFlow" placeholderTextColor="#77809A" maxLength={120} className="rounded-xl border border-border bg-card px-4 py-3 text-white" />
        </View>

        <View className="gap-2">
          <Text className="text-sm font-semibold text-muted">Что должно работать?</Text>
          <View className="rounded-xl border border-border bg-card">
            <TextInput testID="project-prompt-input" value={hint} onChangeText={setHint} placeholder="Опишите пользователей, ключевые экраны и действие, ради которого приложение создаётся…" placeholderTextColor="#77809A" multiline numberOfLines={7} maxLength={2000} className="min-h-[150px] px-4 py-3 text-white" textAlignVertical="top" />
            <View className="flex-row items-center justify-between px-3 pb-3">
              <VoiceInputButton isListening={voice.isListening} onPress={voice.isListening ? voice.stop : voice.start} error={voice.error} volume={voice.volume} language={voice.language} onCycleLanguage={voice.cycleLanguage} />
              <Text className="text-xs text-muted">{hint.length}/2000</Text>
            </View>
          </View>
        </View>

        <View className="gap-2">
          <Text className="text-sm font-semibold text-muted">Глубина</Text>
          <View className="flex-row gap-2">
            {DEPTHS.map((item) => {
              const selected = depth === item.value;
              return <Pressable key={item.value} onPress={() => setDepth(item.value)} accessibilityRole="tab" accessibilityState={{ selected }} className={`flex-1 rounded-xl border px-2 py-3 ${selected ? 'border-accent bg-accent/15' : 'border-border bg-card'}`}><Text className={`text-center text-xs font-semibold ${selected ? 'text-accent' : 'text-white'}`}>{item.label}</Text><Text className="mt-1 text-center text-[10px] text-muted">{item.note}</Text></Pressable>;
            })}
          </View>
        </View>

        {error && <View className="flex-row items-start gap-2 rounded-xl border border-down/40 bg-down/10 px-3 py-3"><XCircle size={17} color="#FB7185" /><Text className="flex-1 text-sm text-down">{error}</Text></View>}

        <Pressable testID="project-generate-button" onPress={submit} disabled={!hint.trim() || busy} accessibilityRole="button" accessibilityState={{ disabled: !hint.trim() || busy }} className={`flex-row items-center justify-center gap-2 rounded-xl px-4 py-4 ${hint.trim() && !busy ? 'bg-accent' : 'bg-border'}`}>
          <WandSparkles size={18} color={hint.trim() && !busy ? '#07111F' : '#77809A'} />
          <Text className={`text-base font-bold ${hint.trim() && !busy ? 'text-bg' : 'text-muted'}`}>{busy ? 'Запускаю сборку…' : 'Создать приложение'}</Text>
        </Pressable>

        <View className="flex-row items-center gap-2 pb-4"><CheckCircle2 size={16} color="#34D399" /><Text className="flex-1 text-xs leading-4 text-muted">Оплата и лимит списываются только после готовности конвейера. Статус и расход токенов видны в карточке проекта.</Text></View>
      </ScrollView>
    </SafeAreaView>
  );
}
