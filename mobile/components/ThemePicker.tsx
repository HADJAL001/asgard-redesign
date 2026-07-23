import { Pressable, Text, View } from 'react-native';
import { Rocket, Wand2, Cpu, Cog, type LucideIcon } from 'lucide-react-native';
import { ARTIFACT_THEMES, type ArtifactThemeKey } from '@/types/artifact';

const THEME_ICONS: Record<ArtifactThemeKey, LucideIcon> = {
  scifi: Rocket,
  fantasy: Wand2,
  cyberpunk: Cpu,
  steampunk: Cog,
};

type Props = {
  value: ArtifactThemeKey | null;
  onChange: (key: ArtifactThemeKey) => void;
};

export function ThemePicker({ value, onChange }: Props) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {ARTIFACT_THEMES.map((theme) => {
        const Icon = THEME_ICONS[theme.key];
        const selected = value === theme.key;
        return (
          <Pressable
            key={theme.key}
            onPress={() => onChange(theme.key)}
            className={`flex-1 min-w-[45%] flex-row items-center gap-2 rounded-xl border px-3 py-3 ${
              selected ? 'border-accent bg-accent/10' : 'border-border bg-card'
            }`}
          >
            <Icon size={18} color={selected ? '#00D4FF' : '#8A8A9A'} />
            <Text className={selected ? 'text-accent font-semibold' : 'text-muted font-medium'}>
              {theme.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
