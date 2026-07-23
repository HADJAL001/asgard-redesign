import { StyleSheet } from 'react-native';
import { colors } from '@/design-system/colors';
import { spacing } from '@/design-system/spacing';

export const globalStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.navy,
    padding: spacing.md,
  },
  card: {
    backgroundColor: colors.darkCard,
    borderRadius: 16,
    padding: spacing.md,
    shadowColor: colors.gold,
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  gradientButton: {
    borderRadius: 16,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
});
