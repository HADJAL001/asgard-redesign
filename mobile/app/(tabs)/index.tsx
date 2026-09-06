import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { CheckCircle2, CircleDashed, Layers3, WandSparkles, XCircle } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';

import { VoiceInputButton } from '@/components/VoiceInputButton';
import { useVoiceInput } from '@/hooks/useVoiceInput';
import { useProjectsQuery, PROJECTS_QUERY_KEY } from '@/hooks/useProjectsQuery';
import { createProject, fetchGenerationDepths, type GenerationDepthOption } from '@/lib/projects-api';
import { ApiError } from '@/lib/api-client';
import { queryClient } from '@/lib/queryClient';
import { buildProjectBrief, isProjectBriefAnswerComplete, isProjectBriefComplete } from '@/lib/project-brief';

type Depth = 'quick' | 'standard' | 'deep';

const FALLBACK_DEPTHS: GenerationDepthOption[] = [
  { id: 'quick', label: 'Быстрая', description: 'В рамках дневной квоты.', credits: 0, countsAgainstQuota: true },
  { id: 'standard', label: 'Стандартная', description: 'Полная AI-генерация.', credits: 20, countsAgainstQuota: false },
  { id: 'deep', label: 'Глубокая', description: 'Свежая AI-генерация без кеша.', credits: 50, countsAgainstQuota: false },
];

export default function CreateScreen() {
  const params = useLocalSearchParams<{ name?: string; hint?: string }>();
  const [name, setName] = useState('');
  const [hint, setHint] = useState('');
  const [briefOpen, setBriefOpen] = useState(false);
  const [brief, setBrief] = useState({ audience: '', outcome: '', essentials: '', constraints: '' });
  const [briefStep, setBriefStep] = useState(0);
  // Первый запуск должен совпадать с web: бесплатный quick, а не платный
  // standard. Более глубокую генерацию пользователь выбирает осознанно.
  const [depth, setDepth] = useState<Depth>('quick');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const voice = useVoiceInput((transcript) => setHint((prev) => (prev ? `${prev} ${transcript}` : transcript)));
  const { data: projects } = useProjectsQuery();
  const { data: generationDepths } = useQuery({
    queryKey: ['project-generation-depths'],
    queryFn: fetchGenerationDepths,
    staleTime: 60_000,
  });
  const active = projects?.find((project) => project.status === 'generating');
  const depths = generationDepths?.length ? generationDepths : FALLBACK_DEPTHS;
  const briefReady = isProjectBriefComplete(brief);
  const isBriefLastStep = briefStep === 3;
  const briefStepValue = [brief.audience, brief.outcome, brief.essentials, brief.constraints][briefStep];

  useEffect(() => {
    if (typeof params.name === 'string' && params.name.trim()) setName(params.name.trim());
    if (typeof params.hint === 'string' && params.hint.trim()) setHint(params.hint.trim());
  }, [params.hint, params.name]);

  const openBrief = useCallback(() => {
    if (!hint.trim() || busy) return;
    setError(null);
    setBrief({ audience: '', outcome: '', essentials: '', constraints: '' });
    setBriefStep(0);
    setBriefOpen(true);
    Haptics.selectionAsync();
  }, [busy, hint]);

  const advanceBrief = useCallback(() => {
    if (!isProjectBriefAnswerComplete(briefStepValue)) return;
    setBriefStep((current) => Math.min(3, current + 1));
    Haptics.selectionAsync();
  }, [briefStepValue]);

  const submit = useCallback(async () => {
    if (!hint.trim() || !briefReady || busy) return;
    setBusy(true);
    setError(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const project = await createProject({ name, hint: buildProjectBrief(hint, brief), depth });
      await queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY });
      router.push(`/project/${project.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не удалось запустить создание проекта');
    } finally {
      setBusy(false);
    }
  }, [brief, briefReady, busy, depth, hint, name]);

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <ScrollView contentContainerStyle={{ padding: 20, gap: 18 }} keyboardShouldPersistTaps="handled">
        <View className="gap-1">
          <Text className="text-xs font-semibold uppercase tracking-[2px] text-accent">OSGARD NEW WORLD</Text>
          <Text className="text-3xl font-bold text-white">Создать проект</Text>
          <Text className="text-sm leading-5 text-muted">Опишите идею, затем ответьте на вопросы о пользователе и результате. Только после этого OSGARD начнет создание.</Text>
        </View>

        <View className="gap-3 rounded-2xl border border-accent/30 bg-card px-4 py-4">
          <View className="flex-row items-center gap-2">
            <Layers3 size={17} color="#00F0FF" />
            <Text className="text-sm font-semibold text-white">Что сделает OSGARD</Text>
          </View>
          <Text className="text-xs leading-5 text-muted">Сформирует план, создаст первый результат и проверит его перед передачей вам.</Text>
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

        {briefOpen && (
          <View className="gap-4 rounded-2xl border border-accent/30 bg-card px-4 py-4">
            <View className="gap-1">
              <Text className="text-base font-semibold text-white">Уточним проект</Text>
              <Text className="text-xs leading-5 text-muted">Ответы станут требованиями для первой версии приложения.</Text>
              <Text className="mt-1 text-xs font-semibold tracking-[1px] text-accent">ВОПРОС {briefStep + 1} ИЗ 4</Text>
            </View>
            {briefStep === 0 && <View className="gap-2">
              <Text className="text-sm font-semibold text-muted">Для кого вы создаете продукт?</Text>
              <TextInput autoFocus value={brief.audience} onChangeText={(audience) => setBrief((current) => ({ ...current, audience }))} placeholder="Например, владельцы небольших кафе" placeholderTextColor="#77809A" maxLength={240} className="rounded-xl border border-border bg-bg px-4 py-3 text-white" />
            </View>}
            {briefStep === 1 && <View className="gap-2">
              <Text className="text-sm font-semibold text-muted">Какой результат должен получить пользователь?</Text>
              <TextInput autoFocus value={brief.outcome} onChangeText={(outcome) => setBrief((current) => ({ ...current, outcome }))} placeholder="Например, оформить заказ за одну минуту" placeholderTextColor="#77809A" maxLength={240} className="rounded-xl border border-border bg-bg px-4 py-3 text-white" />
            </View>}
            {briefStep === 2 && <View className="gap-2">
              <Text className="text-sm font-semibold text-muted">Что обязательно должно быть в первой версии?</Text>
              <TextInput autoFocus value={brief.essentials} onChangeText={(essentials) => setBrief((current) => ({ ...current, essentials }))} placeholder="Например, каталог, корзина, оплата, уведомления" placeholderTextColor="#77809A" multiline numberOfLines={4} maxLength={600} className="min-h-[100px] rounded-xl border border-border bg-bg px-4 py-3 text-white" textAlignVertical="top" />
            </View>}
            {briefStep === 3 && <View className="gap-2">
              <Text className="text-sm font-semibold text-muted">Ограничения или пожелания (необязательно)</Text>
              <TextInput autoFocus value={brief.constraints} onChangeText={(constraints) => setBrief((current) => ({ ...current, constraints }))} placeholder="Например, только мобильная версия, светлый стиль" placeholderTextColor="#77809A" maxLength={400} className="rounded-xl border border-border bg-bg px-4 py-3 text-white" />
            </View>}
            {briefStep > 0 && <Pressable onPress={() => setBriefStep((current) => current - 1)} accessibilityRole="button"><Text className="text-sm font-semibold text-accent">Назад</Text></Pressable>}
          </View>
        )}

        <View className="gap-2">
          <Text className="text-sm font-semibold text-muted">Опишите проект</Text>
          <View className="rounded-xl border border-border bg-card">
          <TextInput testID="project-prompt-input" value={hint} onChangeText={setHint} placeholder="Цель, для кого проект, ключевые функции и желаемый результат…" placeholderTextColor="#77809A" multiline numberOfLines={7} maxLength={2000} className="min-h-[150px] px-4 py-3 text-white" textAlignVertical="top" />
            <View className="flex-row items-center justify-between px-3 pb-3">
              <VoiceInputButton isListening={voice.isListening} onPress={voice.isListening ? voice.stop : voice.start} error={voice.error} volume={voice.volume} language={voice.language} onCycleLanguage={voice.cycleLanguage} />
              <Text className="text-xs text-muted">{hint.length}/2000</Text>
            </View>
          </View>
        </View>

        <View className="gap-2">
          <Text className="text-sm font-semibold text-muted">Глубина</Text>
          <View className="flex-row gap-2">
            {depths.map((item) => {
              const selected = depth === item.id;
              const cost = item.credits > 0 ? `${item.credits} кредитов` : item.countsAgainstQuota ? 'Дневная квота' : 'Бесплатно';
              return <Pressable key={item.id} onPress={() => setDepth(item.id)} accessibilityRole="tab" accessibilityState={{ selected }} className={`flex-1 rounded-xl border px-2 py-3 ${selected ? 'border-accent bg-accent/15' : 'border-border bg-card'}`}><Text numberOfLines={1} className={`text-center text-xs font-semibold ${selected ? 'text-accent' : 'text-white'}`}>{item.label}</Text><Text numberOfLines={1} className="mt-1 text-center text-[10px] text-muted">{cost}</Text></Pressable>;
            })}
          </View>
        </View>

        {error && <View className="flex-row items-start gap-2 rounded-xl border border-down/40 bg-down/10 px-3 py-3"><XCircle size={17} color="#FB7185" /><Text className="flex-1 text-sm text-down">{error}</Text></View>}

        <Pressable testID="project-generate-button" onPress={briefOpen ? (isBriefLastStep ? submit : advanceBrief) : openBrief} disabled={briefOpen ? (isBriefLastStep ? !briefReady || busy : !isProjectBriefAnswerComplete(briefStepValue) || busy) : !hint.trim() || busy} accessibilityRole="button" accessibilityState={{ disabled: briefOpen ? (isBriefLastStep ? !briefReady || busy : !isProjectBriefAnswerComplete(briefStepValue) || busy) : !hint.trim() || busy }} className={`flex-row items-center justify-center gap-2 rounded-xl px-4 py-4 ${(briefOpen ? (isBriefLastStep ? briefReady : isProjectBriefAnswerComplete(briefStepValue)) : hint.trim()) && !busy ? 'bg-accent' : 'bg-border'}`}>
          <WandSparkles size={18} color={(briefOpen ? (isBriefLastStep ? briefReady : isProjectBriefAnswerComplete(briefStepValue)) : hint.trim()) && !busy ? '#07111F' : '#77809A'} />
          <Text className={`text-base font-bold ${(briefOpen ? (isBriefLastStep ? briefReady : isProjectBriefAnswerComplete(briefStepValue)) : hint.trim()) && !busy ? 'text-bg' : 'text-muted'}`}>{busy ? 'Создаю проект…' : briefOpen ? (isBriefLastStep ? 'Начать создание' : 'Далее') : 'Уточнить проект'}</Text>
        </Pressable>

        <View className="flex-row items-center gap-2 pb-4"><CheckCircle2 size={16} color="#34D399" /><Text className="flex-1 text-xs leading-4 text-muted">Оплата и лимит списываются только после готовности конвейера. Статус и расход токенов видны в карточке проекта.</Text></View>
      </ScrollView>
    </SafeAreaView>
  );
}
