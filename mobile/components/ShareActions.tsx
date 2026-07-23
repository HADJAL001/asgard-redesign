import { useState, type RefObject } from 'react';
import { Pressable, Text, View } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { Download, Share2 } from 'lucide-react-native';

type Props = {
  cardRef: RefObject<View | null>;
};

export function ShareActions({ cardRef }: Props) {
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const capture = async () => {
    if (!cardRef.current) throw new Error('Карточка ещё не готова');
    return captureRef(cardRef, { format: 'png', quality: 1 });
  };

  const handleSave = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const { granted } = await MediaLibrary.requestPermissionsAsync();
      if (!granted) {
        setStatus('Нет доступа к галерее');
        return;
      }
      const uri = await capture();
      await MediaLibrary.saveToLibraryAsync(uri);
      setStatus('Сохранено в галерею');
    } catch {
      setStatus('Не удалось сохранить');
    } finally {
      setBusy(false);
    }
  };

  const handleShare = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const uri = await capture();
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri);
      } else {
        setStatus('Шеринг недоступен на этом устройстве');
      }
    } catch {
      setStatus('Не удалось поделиться');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="gap-2">
      <View className="flex-row gap-3">
        <Pressable
          onPress={handleSave}
          disabled={busy}
          className="flex-1 flex-row items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-3"
        >
          <Download size={18} color="#8A8A9A" />
          <Text className="font-semibold text-white">Сохранить</Text>
        </Pressable>
        <Pressable
          onPress={handleShare}
          disabled={busy}
          className="flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3"
        >
          <Share2 size={18} color="#0A0A0F" />
          <Text className="font-semibold text-bg">Поделиться</Text>
        </Pressable>
      </View>
      {status ? <Text className="text-center text-sm text-muted">{status}</Text> : null}
    </View>
  );
}
