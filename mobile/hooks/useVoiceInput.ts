import { useCallback, useState } from 'react';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';

export function useVoiceInput(onResult: (transcript: string) => void) {
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useSpeechRecognitionEvent('start', () => setIsListening(true));
  useSpeechRecognitionEvent('end', () => setIsListening(false));

  useSpeechRecognitionEvent('result', (event) => {
    if (!event.isFinal) return;
    const transcript = event.results[0]?.transcript;
    if (transcript) onResult(transcript);
  });

  useSpeechRecognitionEvent('error', (event) => {
    setIsListening(false);
    setError(event.message || event.error);
  });

  const start = useCallback(async () => {
    setError(null);
    const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!granted) {
      setError('Нет доступа к микрофону');
      return;
    }
    ExpoSpeechRecognitionModule.start({
      lang: 'ru-RU',
      interimResults: false,
      continuous: false,
    });
  }, []);

  const stop = useCallback(() => {
    ExpoSpeechRecognitionModule.stop();
  }, []);

  return { isListening, error, start, stop };
}
