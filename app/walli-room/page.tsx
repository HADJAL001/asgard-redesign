"use client";

import { useState } from "react";
import { useWalliVoice, LANGUAGES } from "./useWalliVoice";

export default function WalliRoomPage() {
  const {
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
  } = useWalliVoice();

  const [inputText, setInputText] = useState("");

  const handleSend = () => {
    if (!inputText.trim()) return;
    handleUserInput(inputText.trim());
    setInputText("");
  };

  return (
    <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6">
      {/* Header */}
      <div className="mb-8 text-center">
        <h1 className="text-4xl font-bold tracking-widest text-cyan-400 mb-2">
          W A L L I
        </h1>
        <p className="text-gray-400 text-sm">Your digital companion</p>
      </div>

      {/* Avatar */}
      <div
        className={`relative w-40 h-40 rounded-full border-4 flex items-center justify-center mb-8 transition-all duration-300 ${
          isSpeaking
            ? "border-cyan-400 shadow-[0_0_40px_rgba(34,211,238,0.6)] animate-pulse"
            : isListening
            ? "border-green-400 shadow-[0_0_30px_rgba(74,222,128,0.5)]"
            : "border-gray-600"
        }`}
      >
        <span className="text-6xl select-none">🤖</span>
        {isSpeaking && (
          <span className="absolute -bottom-2 text-xs text-cyan-400 animate-bounce">
            speaking...
          </span>
        )}
        {isListening && (
          <span className="absolute -bottom-2 text-xs text-green-400 animate-bounce">
            listening...
          </span>
        )}
      </div>

      {/* Reply bubble */}
      {walliReply && (
        <div className="bg-gray-900 border border-cyan-800 rounded-2xl px-6 py-4 mb-6 max-w-md text-center">
          <p className="text-cyan-300 text-sm leading-relaxed">{walliReply}</p>
        </div>
      )}

      {/* Transcript */}
      {transcript && (
        <div className="text-gray-500 text-xs mb-4 italic">
          You: "{transcript}"
        </div>
      )}

      {/* Controls */}
      <div className="flex gap-3 mb-6">
        {sttSupported && (
          <button
            onClick={isListening ? stopListening : startListening}
            className={`px-5 py-2 rounded-full font-medium text-sm transition-all ${
              isListening
                ? "bg-red-600 hover:bg-red-700 text-white"
                : "bg-green-700 hover:bg-green-600 text-white"
            }`}
          >
            {isListening ? "⏹ Stop" : "🎤 Listen"}
          </button>
        )}
        {isSpeaking && (
          <button
            onClick={stopSpeaking}
            className="px-5 py-2 rounded-full bg-gray-700 hover:bg-gray-600 text-white text-sm"
          >
            🔇 Mute
          </button>
        )}
      </div>

      {/* Text input */}
      <div className="flex gap-2 w-full max-w-md mb-6">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Type a message..."
          className="flex-1 bg-gray-900 border border-gray-700 rounded-full px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan-600"
        />
        <button
          onClick={handleSend}
          disabled={!inputText.trim()}
          className="px-5 py-2 bg-cyan-700 hover:bg-cyan-600 disabled:opacity-40 rounded-full text-sm font-medium text-white transition-all"
        >
          Send
        </button>
      </div>

      {/* Settings */}
      <div className="flex flex-wrap gap-4 items-center justify-center text-sm">
        {/* Language */}
        <div className="flex items-center gap-2">
          <span className="text-gray-400">🌐 Lang:</span>
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            className="bg-gray-900 border border-gray-700 rounded-md px-2 py-1 text-white text-xs focus:outline-none focus:border-cyan-600"
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </div>

        {/* Response mode */}
        <div className="flex items-center gap-2">
          <span className="text-gray-400">Mode:</span>
          {(["text", "voice", "both"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setResponseMode(mode)}
              className={`px-3 py-1 rounded-full text-xs transition-all ${
                responseMode === mode
                  ? "bg-cyan-700 text-white"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {!sttSupported && (
        <p className="mt-6 text-xs text-gray-600">
          Speech recognition not supported in this browser.
        </p>
      )}
    </main>
  );
}
