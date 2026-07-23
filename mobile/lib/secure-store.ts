import { Platform } from 'react-native';
import * as ExpoSecureStore from 'expo-secure-store';

// expo-secure-store оборачивает Keychain/Keystore и не имеет веб-реализации
// (ExpoSecureStore.web.js — пустой объект), поэтому в браузере (`expo start --web`)
// падает с "getValueWithKeyAsync is not a function". На native-платформах эта
// обёртка — чистый passthrough к настоящему SecureStore, поведение не меняется.
export async function getItemAsync(key: string): Promise<string | null> {
  if (Platform.OS === 'web') return localStorage.getItem(key);
  return ExpoSecureStore.getItemAsync(key);
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.setItem(key, value);
    return;
  }
  await ExpoSecureStore.setItemAsync(key, value);
}

export async function deleteItemAsync(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.removeItem(key);
    return;
  }
  await ExpoSecureStore.deleteItemAsync(key);
}
