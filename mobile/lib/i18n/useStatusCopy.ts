import { useMemo } from 'react';
import { getLocales } from 'expo-localization';
import { STATUS_COPY, type AppLocale } from './statusCopy';

const SUPPORTED: AppLocale[] = ['ru', 'en', 'kz'];

function resolveDeviceLocale(): AppLocale {
  const tag = getLocales()[0]?.languageCode?.toLowerCase();
  return (SUPPORTED as string[]).includes(tag ?? '') ? (tag as AppLocale) : 'ru';
}

/** Self-contained status/rarity copy lookup — reads the device locale directly, no app-wide i18n provider required. */
export function useStatusCopy() {
  return useMemo(() => STATUS_COPY[resolveDeviceLocale()], []);
}
