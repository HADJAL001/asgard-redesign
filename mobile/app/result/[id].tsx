import { useRef } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { LoadingAnimation } from '@/components/LoadingAnimation';
import { ResultCard } from '@/components/ResultCard';
import { ShareActions } from '@/components/ShareActions';
import { useArtifactsQuery } from '@/hooks/useArtifactsQuery';

export default function ResultScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: artifacts, isLoading } = useArtifactsQuery();
  const cardRef = useRef<View>(null);

  const artifact = artifacts?.find((a) => String(a.id) === id);

  if (isLoading && !artifact) {
    return <LoadingAnimation label="Загрузка артефакта" />;
  }

  if (!artifact) {
    return (
      <View className="flex-1 items-center justify-center bg-bg px-6">
        <Text className="text-center text-muted">Артефакт не найден</Text>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-bg" contentContainerStyle={{ padding: 16, gap: 16 }}>
      <View ref={cardRef} collapsable={false} className="bg-bg">
        <ResultCard artifact={artifact} />
      </View>
      <ShareActions cardRef={cardRef} />
    </ScrollView>
  );
}
