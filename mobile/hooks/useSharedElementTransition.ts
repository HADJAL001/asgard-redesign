import { useMemo } from 'react';

import { portalTransition } from '@/design-system/animations';

/**
 * Общий тег shared element transition для карточки артефакта и экрана деталей —
 * оба места должны использовать один и тот же id, чтобы Reanimated связал элементы.
 */
export function useSharedElementTransition(artifactId: string | number) {
  return useMemo(
    () => ({
      sharedTransitionTag: `artifact-${artifactId}`,
      sharedTransitionStyle: portalTransition,
    }),
    [artifactId],
  );
}
