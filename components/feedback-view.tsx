"use client"

import { useState } from "react"
import { Send, MessageCircle, Sparkles, CheckCircle2, User, Mail } from "lucide-react"
import { Navbar } from "./navbar"
import { apiClient, ApiError } from "@/lib/api-client"

/* ---- Palette (совпадает со стилем остальной платформы) ----
   bg #0A0A0F · card #14141E · accent #00D4FF · text #FFFFFF · label #6A6A8A · border #2A2A3E */

export function FeedbackView() {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{ reward: number } | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!name.trim() || !email.trim() || message.trim().length < 5) {
      setError("Заполните все поля. Сообщение должно быть не короче 5 символов.")
      return
    }

    setLoading(true)
    try {
      const res = await apiClient.post<{ success: boolean; reward: number; rewardGranted: boolean }>(
        "/feedback",
        { name: name.trim(), email: email.trim(), message: message.trim() },
      )
      setSuccess({ reward: res.reward })
      setName("")
      setEmail("")
      setMessage("")
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось отправить сообщение")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen font-sans"
      style={{ background: "linear-gradient(180deg, #0A0A0F 0%, #0A1628 100%)", color: "#FFFFFF" }}
    >
      <Navbar />

      <main className="mx-auto w-full max-w-3xl px-6 py-10 md:px-10">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div
            className="flex size-11 items-center justify-center rounded-xl"
            style={{ backgroundColor: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.25)" }}
          >
            <MessageCircle size={20} strokeWidth={1.75} style={{ color: "#00D4FF" }} />
          </div>
          <div>
            <h1 className="text-[28px] font-semibold leading-tight">Чат с создателем OSGARD</h1>
            <p className="mt-0.5 text-[14px]" style={{ color: "rgba(255,255,255,0.4)" }}>
              Расскажи, что нравится, что сломано и чего не хватает
            </p>
          </div>
        </div>

        {/* Reward banner */}
        <div
          className="mt-6 flex items-center gap-3 rounded-xl px-5 py-4"
          style={{ backgroundColor: "rgba(0,212,255,0.06)", border: "1px solid rgba(0,212,255,0.2)" }}
        >
          <Sparkles size={18} strokeWidth={1.75} style={{ color: "#00D4FF" }} />
          <p className="text-[14px]" style={{ color: "rgba(255,255,255,0.75)" }}>
            За отправленный фидбек ты получишь{" "}
            <span className="font-semibold" style={{ color: "#00D4FF" }}>
              +5 ∞
            </span>{" "}
            на баланс TimeCoin
          </p>
        </div>

        {/* Form / Success */}
        <section
          className="mt-6 rounded-2xl p-6 md:p-8"
          style={{ backgroundColor: "#14141E", border: "1px solid #2A2A3E" }}
        >
          {success ? (
            <div className="flex flex-col items-center gap-4 py-10 text-center">
              <div
                className="flex size-16 items-center justify-center rounded-full"
                style={{ backgroundColor: "rgba(74,222,128,0.12)" }}
              >
                <CheckCircle2 size={32} strokeWidth={1.5} style={{ color: "#4ADE80" }} />
              </div>
              <h2 className="text-[20px] font-medium">Спасибо за фидбек!</h2>
              <p className="max-w-sm text-[14px] leading-relaxed" style={{ color: "rgba(255,255,255,0.6)" }}>
                Сообщение получено создателем OSGARD.
                {success.reward > 0 && (
                  <>
                    {" "}
                    На твой баланс начислено{" "}
                    <span className="font-medium" style={{ color: "#00D4FF" }}>
                      +{success.reward} ∞
                    </span>
                    .
                  </>
                )}
              </p>
              <button
                type="button"
                onClick={() => setSuccess(null)}
                className="mt-2 inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-[14px] font-medium transition-opacity"
                style={{ backgroundColor: "#00D4FF", color: "#0A0A0F" }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.9")}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
              >
                Отправить ещё
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div>
                  <label className="mb-2 flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-[0.1em]" style={{ color: "#6A6A8A" }}>
                    <User size={13} strokeWidth={1.75} />
                    Имя
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Как к тебе обращаться?"
                    className="w-full rounded-lg px-4 py-3 text-[14px] outline-none placeholder:text-white/30"
                    style={{ backgroundColor: "#0A0A0F", border: "1px solid #2A2A3E", color: "#FFFFFF" }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = "#00D4FF")}
                    onBlur={(e) => (e.currentTarget.style.borderColor = "#2A2A3E")}
                  />
                </div>
                <div>
                  <label className="mb-2 flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-[0.1em]" style={{ color: "#6A6A8A" }}>
                    <Mail size={13} strokeWidth={1.75} />
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full rounded-lg px-4 py-3 text-[14px] outline-none placeholder:text-white/30"
                    style={{ backgroundColor: "#0A0A0F", border: "1px solid #2A2A3E", color: "#FFFFFF" }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = "#00D4FF")}
                    onBlur={(e) => (e.currentTarget.style.borderColor = "#2A2A3E")}
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-[12px] font-medium uppercase tracking-[0.1em]" style={{ color: "#6A6A8A" }}>
                  Сообщение
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={6}
                  placeholder="Опиши идею, баг или пожелание…"
                  className="w-full resize-none rounded-lg px-4 py-3 text-[14px] outline-none placeholder:text-white/30"
                  style={{ backgroundColor: "#0A0A0F", border: "1px solid #2A2A3E", color: "#FFFFFF" }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "#00D4FF")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "#2A2A3E")}
                />
              </div>

              {error && (
                <p className="rounded-lg px-4 py-3 text-[13px]" style={{ backgroundColor: "rgba(248,113,113,0.1)", color: "#F87171" }}>
                  {error}
                </p>
              )}

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex items-center gap-2 rounded-lg px-6 py-3 text-[14px] font-medium transition-opacity disabled:opacity-50"
                  style={{ backgroundColor: "#00D4FF", color: "#0A0A0F" }}
                  onMouseEnter={(e) => !loading && (e.currentTarget.style.opacity = "0.9")}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
                >
                  <Send size={16} strokeWidth={1.75} />
                  {loading ? "Отправка…" : "Отправить создателю"}
                </button>
              </div>
            </form>
          )}
        </section>
      </main>
    </div>
  )
}
