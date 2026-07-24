import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Coins, Sparkles } from 'lucide-react-native';

import { ThemePicker } from '@/components/ThemePicker';
import { VoiceInputButton } from '@/components/VoiceInputButton';
import { GenerationProgress, type ForgePhase } from '@/components/GenerationProgress';
import { useVoiceInput } from '@/hooks/useVoiceInput';
import { useWalletQuery } from '@/hooks/useWalletQuery';
import { useArtifactsQuery, countTodayAiGenerated } from '@/hooks/useArtifactsQuery';
import { useGenerateArtifact, AI_GENERATE_COST_TC } from '@/hooks/useGenerateArtifact';
import { ARTIFACT_THEMES, DAILY_AI_GENERATION_SOFT_LIMIT, type ArtifactThemeKey } from '@/types/artifact';
import { ApiError } from '@/lib/api-client';
import { colors } from '@/design-system/colors';

export default function CreateScreen() {
  const [description, setDescription] = useState('');
  const [themeKey, setThemeKey] = useState<ArtifactThemeKey | null>(null);
  const [phase, setPhase] = useState<ForgePhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [revealRarity, setRevealRarity] = useState<string | undefined>(undefined);

  const { data: wallet } = useWalletQuery();
  const { data: artifacts } = useArtifactsQuery();
  const generateArtifact = useGenerateArtifact();
  const voice = useVoiceInput((transcript) => setDescription((prev) => (prev ? `${prev} ${transcript}` : transcript)));

  const todayCount = countTodayAiGenerated(artifacts);
  const balance = wallet?.timecoin ?? 0;
  const canAfford = balance >= AI_GENERATE_COST_TC;
  const canSubmit = description.trim().length > 0 && canAfford && phase === 'idle';

  const handleGenerate = useCallback(async () => {
    if (!canSubmit) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setError(null);
    const theme = ARTIFACT_THEMES.find((t) => t.key === themeKey);
    const hint = theme ? `${theme.hint} ${description.trim()}` : description.trim();

    setPhase('charging');

    try {
      // 'charging' зациклен на произвольную длительность (InfinityForgeSymbol), поэтому
      // 'burst' включаем по факту ответа backend, а не по гадательному таймеру — так на
      // долгой AI-генерации анимация не замирает в промежуточном состоянии.
      const result = await generateArtifact.mutateAsync(hint);
      setPhase('burst');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await new Promise((resolve) => setTimeout(resolve, 350));
      setRevealRarity(result.artifact.rarity);
      setPhase('reveal');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setTimeout(() => {
        setPhase('idle');
        setRevealRarity(undefined);
        setDescription('');
        router.push(`/result/${result.artifact.id}`);
      }, 700);
    } catch (e) {
      setPhase('idle');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setError(e instanceof ApiError ? e.message : 'Не удалось создать артефакт');
    }
  }, [canSubmit, themeKey, description, generateArtifact]);

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} keyboardShouldPersistTaps="handled">
        <Text className="text-2xl font-bold text-white">Создать артефакт</Text>

        <View className="flex-row items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
          <View className="flex-row items-center gap-2">
            <Coins size={18} color={colors.cyan} />
            <Text className="text-white">{balance.toLocaleString('ru-RU')} ∞</Text>
          </View>
          <Text
            className={todayCount >= DAILY_AI_GENERATION_SOFT_LIMIT ? undefined : 'text-muted'}
            style={todayCount >= DAILY_AI_GENERATION_SOFT_LIMIT ? { color: colors.goldTinted } : undefined}
          >
            Сегодня: {todayCount}/{DAILY_AI_GENERATION_SOFT_LIMIT}
          </Text>
        </View>

        <View className="gap-2">
          <Text className="text-sm font-semibold text-muted">Тема</Text>
          <ThemePicker value={themeKey} onChange={setThemeKey} />
        </View>

        <View className="gap-2">
          <Text className="text-sm font-semibold text-muted">Описание</Text>
          <View className="rounded-xl border border-border bg-card">
            <TextInput
              testID="create-description-input"
              value={description}
              onChangeText={setDescription}
              placeholder="Опишите артефакт, который хотите создать…"
              placeholderTextColor="#8A8A9A"
              multiline
              numberOfLines={5}
              className="min-h-[120px] px-4 py-3 text-white"
              textAlignVertical="top"
            />
          </View>
          <View className="items-end">
            <VoiceInputButton
              isListening={voice.isListening}
              onPress={voice.isListening ? voice.stop : voice.start}
              error={voice.error}
              volume={voice.volume}
              language={voice.language}
              onCycleLanguage={voice.cycleLanguage}
            />
          </View>
        </View>

        {!canAfford && (
          <Text className="text-sm" style={{ color: colors.goldTinted }}>
            Не хватает совсем немного TimeCoin — нужно ещё {AI_GENERATE_COST_TC - balance} ∞
          </Text>
        )}
        {error && <Text className="text-sm text-down">{error}</Text>}

        <Pressable
          testID="create-generate-button"
          onPress={handleGenerate}
          disabled={!canSubmit}
          className={`flex-row items-center justify-center gap-2 rounded-xl px-4 py-4 ${
            canSubmit ? 'bg-accent' : 'bg-border'
          }`}
        >
          <Sparkles size={18} color={canSubmit ? '#0A0A0F' : '#8A8A9A'} />
          <Text className={`text-base font-bold ${canSubmit ? 'text-bg' : 'text-muted'}`}>Сгенерировать</Text>
        </Pressable>
      </ScrollView>

      <GenerationProgress phase={phase} rarity={revealRarity} />
    </SafeAreaView>
  );
}
