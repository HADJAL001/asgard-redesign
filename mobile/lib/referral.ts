/* ================================================================
   OSGARD · Referral code capture (мобильная адаптация lib/referral.ts)
   ----------------------------------------------------------------
   На вебе код приходит в query-параметре `?ref=` текущего URL и
   хранится в localStorage. На мобилке страницы нет — код приходит
   через deep link (expo-linking) при первом открытии приложения по
   реферальной ссылке, а хранится в AsyncStorage (не SecureStore —
   это не секрет, а обычный маркетинговый идентификатор).
   ================================================================ */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';

const REF_KEY = 'osgard_ref_code';

export async function captureReferralCode(code: string | null | undefined): Promise<void> {
  if (!code) return;
  try {
    await AsyncStorage.setItem(REF_KEY, code);
  } catch {
    /* ignore storage errors */
  }
}

/** Парсит deep link (например, из Linking.getInitialURL()/addEventListener) и сохраняет `ref`, если он есть. */
export async function captureReferralCodeFromUrl(url: string | null | undefined): Promise<void> {
  if (!url) return;
  const { queryParams } = Linking.parse(url);
  const ref = queryParams?.ref;
  if (typeof ref === 'string') await captureReferralCode(ref);
}

export async function getReferralCode(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(REF_KEY);
  } catch {
    return null;
  }
}

export async function clearReferralCode(): Promise<void> {
  try {
    await AsyncStorage.removeItem(REF_KEY);
  } catch {
    /* ignore storage errors */
  }
}
