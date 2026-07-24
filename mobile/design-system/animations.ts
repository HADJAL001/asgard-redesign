import { Easing, SharedTransition, withTiming } from 'react-native-reanimated';

export const CINEMATIC_DURATION = 400;

export const cinematicEasing = Easing.out(Easing.cubic);

/**
 * Портальный переход карточки артефакта: тот же bounding-box интерполятор, что и
 * реанимейтовский дефолт, но на кинематографических easing/длительности приложения.
 */
export const portalTransition = SharedTransition.custom((values) => {
  'worklet';
  return {
    initialValues: {
      width: values.currentWidth,
      height: values.currentHeight,
      originX: values.currentOriginX,
      originY: values.currentOriginY,
    },
    animations: {
      width: withTiming(values.targetWidth, { duration: CINEMATIC_DURATION, easing: cinematicEasing }),
      height: withTiming(values.targetHeight, { duration: CINEMATIC_DURATION, easing: cinematicEasing }),
      originX: withTiming(values.targetOriginX, { duration: CINEMATIC_DURATION, easing: cinematicEasing }),
      originY: withTiming(values.targetOriginY, { duration: CINEMATIC_DURATION, easing: cinematicEasing }),
    },
  };
});
