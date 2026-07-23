import { StyleSheet, Text, View } from 'react-native';
import { useIsOnline } from '@/lib/querySync';

export function OfflineBanner() {
  const isOnline = useIsOnline();
  if (isOnline) return null;

  return (
    <View style={styles.banner}>
      <Text style={styles.text}>Офлайн — показаны сохранённые данные</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#7a1f1f',
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  text: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
});
