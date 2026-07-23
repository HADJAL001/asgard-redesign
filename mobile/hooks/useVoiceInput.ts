import { useCallback, useEffect, useRef, useState } from 'react';
import type { ExpoSpeechRecognitionErrorCode } from 'expo-speech-recognition';

// expo-speech-recognition вызывает requireNativeModule() прямо при импорте — в Expo Go
// (без custom dev client) этого нативного модуля нет, и импорт падает синхронно, обрушивая
// весь экран, который использует этот хук. Поэтому импортируем через require в try/catch
// и в Expo Go подставляем no-op заглушку вместо реального модуля/хука.
let ExpoSpeechRecognitionModule: any;
let useSpeechRecognitionEvent: (eventName: string, listener: (...args: any[]) => void) => void;
try {
  const speechRecognition = require('expo-speech-recognition');
  ExpoSpeechRecognitionModule = speechRecognition.ExpoSpeechRecognitionModule;
  useSpeechRecognitionEvent = speechRecognition.useSpeechRecognitionEvent;
} catch {
  ExpoSpeechRecognitionModule = {
    requestPermissionsAsync: async () => ({ granted: false }),
    start: () => {},
    stop: () => {},
    abort: () => {},
  };
  useSpeechRecognitionEvent = () => {};
}

export type VoiceLanguage = 'ru-RU' | 'en-US' | 'kk-KZ';

const LANGUAGE_CYCLE: VoiceLanguage[] = ['ru-RU', 'en-US', 'kk-KZ'];

/** Пауза без речи, после которой запись останавливается автоматически. */
const SILENCE_AUTOSTOP_MS = 1500;
/** Жёсткий предел на одну сессию записи, чтобы не слушать бесконечно. */
const MAX_RECORDING_MS = 30_000;

const ERROR_MESSAGES: Partial<Record<ExpoSpeechRecognitionErrorCode, string>> = {
  'not-allowed': 'Нет доступа к микрофону. Разрешите доступ в настройках устройства.',
  'service-not-allowed': 'Распознавание речи недоступно на этом устройстве.',
  'no-speech': 'Речь не распознана. Попробуйте сказать ещё раз.',
  'speech-timeout': 'Вы ничего не сказали — попробуйте ещё раз.',
  'audio-capture': 'Не удалось записать звук с микрофона.',
  network: 'Нет соединения для распознавания речи. Проверьте интернет.',
  'language-not-supported': 'Выбранный язык не поддерживается на этом устройстве.',
  busy: 'Распознавание уже выполняется, подождите.',
};

function describeError(code: ExpoSpeechRecognitionErrorCode, fallbackMessage: string) {
  return ERROR_MESSAGES[code] ?? fallbackMessage ?? 'Произошла ошибка распознавания речи.';
}

export function useVoiceInput(onResult: (transcript: string) => void) {
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolume] = useState(0);
  const [language, setLanguage] = useState<VoiceLanguage>('ru-RU');

  const silenceTimer = useRef<ReturnType<typeof setTimeout>>();
  const maxDurationTimer = useRef<ReturnType<typeof setTimeout>>();

  const clearTimers = useCallback(() => {
    clearTimeout(silenceTimer.current);
    clearTimeout(maxDurationTimer.current);
    silenceTimer.current = undefined;
    maxDurationTimer.current = undefined;
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  useSpeechRecognitionEvent('start', () => {
    setIsListening(true);
    setVolume(0);
  });

  useSpeechRecognitionEvent('end', () => {
    setIsListening(false);
    setVolume(0);
    clearTimers();
  });

  // Как только пользователь снова заговорил — отменяем таймер автостопа по паузе.
  useSpeechRecognitionEvent('speechstart', () => {
    clearTimeout(silenceTimer.current);
  });

  // Пауза в речи: если тишина продлится дольше SILENCE_AUTOSTOP_MS, считаем, что
  // пользователь закончил, и останавливаем запись сами (на некоторых платформах
  // continuous:false этого не делает достаточно быстро).
  useSpeechRecognitionEvent('speechend', () => {
    clearTimeout(silenceTimer.current);
    silenceTimer.current = setTimeout(() => {
      ExpoSpeechRecognitionModule.stop();
    }, SILENCE_AUTOSTOP_MS);
  });

  // value: от -2 до 10, ниже 0 — тишина. Нормализуем в 0..1 для UI-индикатора громкости.
  useSpeechRecognitionEvent('volumechange', (event) => {
    setVolume(Math.max(0, Math.min(1, event.value / 10)));
  });

  useSpeechRecognitionEvent('result', (event) => {
    if (!event.isFinal) return;
    const transcript = event.results[0]?.transcript;
    if (transcript) onResult(transcript);
  });

  useSpeechRecognitionEvent('error', (event) => {
    setIsListening(false);
    clearTimers();
    if (event.error === 'aborted') return;
    setError(describeError(event.error, event.message));
  });

  const start = useCallback(async () => {
    setError(null);
    const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!granted) {
      setError('Нет доступа к микрофону. Разрешите доступ в настройках устройства.');
      return;
    }

    clearTimers();
    ExpoSpeechRecognitionModule.start({
      lang: language,
      interimResults: false,
      continuous: false,
      volumeChangeEventOptions: { enabled: true, intervalMillis: 150 },
    });

    maxDurationTimer.current = setTimeout(() => {
      ExpoSpeechRecognitionModule.stop();
    }, MAX_RECORDING_MS);
  }, [language, clearTimers]);

  const stop = useCallback(() => {
    clearTimers();
    ExpoSpeechRecognitionModule.stop();
  }, [clearTimers]);

  const cycleLanguage = useCallback(() => {
    setLanguage((current) => {
      const next = LANGUAGE_CYCLE[(LANGUAGE_CYCLE.indexOf(current) + 1) % LANGUAGE_CYCLE.length];
      return next;
    });
  }, []);

  return { isListening, error, volume, language, cycleLanguage, start, stop };
}
