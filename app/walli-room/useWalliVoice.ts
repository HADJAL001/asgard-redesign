"use client";

import { useCallback, useState } from "react";
import apiClient from "@/lib/api-client";
import { useVoice } from "@/hooks/useVoice";

export type ResponseMode = "text" | "voice" | "both";

export const LANGUAGES = [
  { code: "en-US", label: "English" },
  { code: "ru-RU", label: "Русский" },
  { code: "kk-KZ", label: "Қазақша" },
];

type JarvisAskResponse = { answer: string; route?: string };

export function useWalliVoice() {
  const voice = useVoice();
  const [transcript, setTranscript] = useState("");
  const [walliReply, setWalliReply] = useState("");
  const [responseMode, setResponseMode] = useState<ResponseMode>("both");
  const [lang, setLang] = useState("en-US");
  const [voiceOpen, setVoiceOpen] = useState(false);

  const speak = useCallback(
    (text: string) => {
      voice.speak(text, { lang, rate: 0.7, pitch: 1.6 });
    },
    [voice, lang]
  );

  const askWalli = useCallback(
    async (text: string): Promise<string> => {
      try {
        const res = await apiClient.post<JarvisAskResponse>("/jarvis/ask", { question: text });
        return res.answer;
      } catch (e: any) {
        return e?.message || "ВАЛЛИ временно недоступен. Попробуйте позже.";
      }
    },
    []
  );

  const startListening = useCallback(() => {
    voice.startListening({
      lang,
      onResult: async (text) => {
        setTranscript(text);
        const reply = await askWalli(text);
        setWalliReply(reply);
        if (responseMode === "voice" || responseMode === "both") {
          speak(reply);
        }
      },
    });
  }, [voice, lang, responseMode, speak, askWalli]);

  const handleUserInput = useCallback(
    async (text: string): Promise<string> => {
      setTranscript(text);
      const reply = await askWalli(text);
      setWalliReply(reply);
      if (responseMode === "voice" || responseMode === "both") {
        speak(reply);
      }
      return reply;
    },
    [responseMode, speak, askWalli]
  );

  return {
    speak,
    startListening,
    stopListening: voice.stopListening,
    stopSpeaking: voice.stopSpeaking,
    isListening: voice.isListening,
    isSpeaking: voice.isSpeaking,
    transcript,
    walliReply,
    voiceOpen,
    setVoiceOpen,
    responseMode,
    setResponseMode,
    lang,
    setLang,
    sttSupported: voice.sttSupported,
    handleUserInput,
  };
}
