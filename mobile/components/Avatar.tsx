import { Image, Text, View } from 'react-native';

type AvatarSize = 48 | 64 | 80;

type AvatarProps = {
  uri?: string | null;
  name: string;
  size?: AvatarSize;
  /** Место в рейтинге — если в топ-10, аватар получает золотое кольцо. */
  rank?: number | null;
};

const FONT_SIZE: Record<AvatarSize, number> = {
  48: 16,
  64: 20,
  80: 26,
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/** Аватар пользователя: фото или инициалы-заглушка, с золотым кольцом для топ-10 рейтинга. */
export function Avatar({ uri, name, size = 64, rank }: AvatarProps) {
  const isTop10 = typeof rank === 'number' && rank <= 10;
  const ringColor = isTop10 ? '#D4AF37' : '#22222E';
  const outerSize = size + 6;

  return (
    <View
      className="items-center justify-center"
      style={{
        width: outerSize,
        height: outerSize,
        borderRadius: outerSize / 2,
        borderWidth: isTop10 ? 2 : 1,
        borderColor: ringColor,
      }}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
        />
      ) : (
        <View
          className="items-center justify-center bg-card"
          style={{ width: size, height: size, borderRadius: size / 2 }}
        >
          <Text style={{ fontSize: FONT_SIZE[size], color: '#00D4FF' }} className="font-bold">
            {initials(name)}
          </Text>
        </View>
      )}
    </View>
  );
}
