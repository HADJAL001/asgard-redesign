"use client";

import { useState, useRef, useCallback } from "react";

export type ResponseMode = "text" | "voice" | "both";

export const LANGUAGES = [
  { code: "en-US", label: "English" },
  { code: "ru-RU", label: "Русский" },
  { code: "kk-KZ", label: "Қазақша" },
];

const GREETINGS = ["hi", "hello", "hey", "привет", "сәлем", "hola", "bonjour", "hallo"];

const REPLIES = [
  "Hello, architect! I am WALLI.",
  "Beep boop. Ready to assist.",
  "WALLI is here! Let's build something amazing.",
  "Hi there! How can I help you today?",
  "Greetings! The universe awaits your creations.",
  "Hey! I'm WALLI, your digital companion.",
];

const REPLIES_RU = [
  "Привет, архитектор! Я — ВАЛЛИ.",
  "Бип-буп. Готов к работе.",
  "ВАЛЛИ здесь! Давай создадим что-то удивительное.",
  "Привет! Чем могу помочь сегодня?",
  "Здравствуй! Вселенная ждёт твоих творений.",
  "Привет! Я — ВАЛЛИ, твой цифровой спутник.",
];

const REPLIES_KZ = [
  "Сәлем, архитектор! Мен — ВАЛЛИ.",
  "Бип-буп. Жұмысқа дайын.",
  "ВАЛЛИ мұнда! Керемет нәрсе жасайық.",
  "Сәлем! Бүгін қалай көмектесе аламын?",
  "Сәлем! Ғалам сенің туындыларыңды күтеді.",
  "Сәлем! Мен — ВАЛЛИ, сенің цифрлық серігің.",
];

function getReply(input: string): { text: string; lang: string } {
  const lower = input.toLowerCase();
  const isGreeting = GREETINGS.some((w) => lower.includes(w));
  if (!isGreeting) return { text: REPLIES[Math.floor(Math.random() * REPLIES.length)], lang: "en-US" };

  if (lower.includes("сәлем") || lower.includes("қалай")) {
    return { text: REPLIES_KZ[Math.floor(Math.random() * REPLIES_KZ.length)], lang: "kk-KZ" };
  }
  if (lower.includes("привет") || lower.includes("здравствуй")) {
    return { text: REPLIES_RU[Math.floor(Math.random() * REPLIES_RU.length)], lang: "ru-RU" };
  }
  return { text: REPLIES[Math.floor(Math.random() * REPLIES.length)], lang: "en-US" };
}

export function useWalliVoice() {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [walliReply, setWalliReply] = useState("");
  const [responseMode, setResponseMode] = useState<ResponseMode>("both");
  const [lang, setLang] = useState("en-US");
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [sttSupported] = useState(
    () =>
      typeof window !== "undefined" &&
      ("SpeechRecognition" in window || "webkitSpeechRecognition" in window)
  );

  const recognitionRef = useRef<any>(null);

  const speak = useCallback(
    (text: string) => {
      if (typeof window === "undefined") return;
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.7;
        utterance.pitch = 1.6;
        utterance.lang = lang;
        utterance.onstart = () => setIsSpeaking(true);
        utterance.onend = () => setIsSpeaking(false);
        utterance.onerror = () => setIsSpeaking(false);
        window.speechSynthesis.speak(utterance);
      } catch (e) {
        console.warn("Speech error:", e);
      }
    },
    [lang]
  );

  const startListening = useCallback(() => {
    if (typeof window === "undefined") return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("Speech recognition not supported");
      return;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (e) {}
      recognitionRef.current = null;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = lang;
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);

    recognition.onresult = (event: any) => {
      const text = event.results[0][0].transcript;
      setTranscript(text);
      const reply = getReply(text);
      setWalliReply(reply.text);
      if (reply.lang !== lang) setLang(reply.lang);
      if (responseMode === "voice" || responseMode === "both") {
        speak(reply.text);
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [lang, responseMode, speak]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (e) {}
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, []);

  const stopSpeaking = useCallback(() => {
    if (typeof window !== "undefined") {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  }, []);

  const handleUserInput = useCallback(
    (text: string) => {
      setTranscript(text);
      const reply = getReply(text);
      setWalliReply(reply.text);
      if (reply.lang !== lang) setLang(reply.lang);
      if (responseMode === "voice" || responseMode === "both") {
        speak(reply.text);
      }
    },
    [lang, responseMode, speak]
  );

  return {
    speak,
    startListening,
    stopListening,
    stopSpeaking,
    isListening,
    isSpeaking,
    transcript,
    walliReply,
    voiceOpen,
    setVoiceOpen,
    responseMode,
    setResponseMode,
    lang,
    setLang,
    sttSupported,
    handleUserInput,
  };
}
