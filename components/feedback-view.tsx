"use client"

import { useState } from "react"
import { Send, MessageCircle, Sparkles, CheckCircle2, User, Mail } from "lucide-react"
import { Navbar } from "./navbar"
import { apiClient, ApiError } from "@/lib/api-client"

/* ---- Palette (совпадает со стилем остальной платформы) ----
   bg #10181d · card #17242a · accent #d7ae57 · text #FFFFFF · label #9eb2bc · border #30424b */

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
      style={{ background: "linear-gradient(180deg, #10181d 0%, #0A1628 100%)", color: "#FFFFFF" }}
    >
      <Navbar />

      <main className="mx-auto w-full max-w-3xl px-6 py-10 md:px-10">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div
            className="flex size-11 items-center justify-center rounded-xl"
            style={{ backgroundColor: "rgba(215, 174, 87,0.1)", border: "1px solid rgba(215, 174, 87,0.25)" }}
          >
            <MessageCircle size={20} strokeWidth={1.75} style={{ color: "#d7ae57" }} />
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
          style={{ backgroundColor: "rgba(215, 174, 87,0.06)", border: "1px solid rgba(215, 174, 87,0.2)" }}
        >
          <Sparkles size={18} strokeWidth={1.75} style={{ color: "#d7ae57" }} />
          <p className="text-[14px]" style={{ color: "rgba(255,255,255,0.75)" }}>
            За отправленный фидбек ты получишь{" "}
            <span className="font-semibold" style={{ color: "#d7ae57" }}>
              +5 ∞
            </span>{" "}
            на баланс TimeCoin
          </p>
        </div>

        {/* Form / Success */}
        <section
          className="mt-6 rounded-2xl p-6 md:p-8"
          style={{ backgroundColor: "#17242a", border: "1px solid #30424b" }}
        >
          {success ? (
            <div className="flex flex-col items-center gap-4 py-10 text-center">
              <div
                className="flex size-16 items-center justify-center rounded-full"
                style={{ backgroundColor: "rgba(74,222,128,0.12)" }}
              >
                <CheckCircle2 size={32} strokeWidth={1.5} style={{ color: "#d7ae57" }} />
              </div>
              <h2 className="text-[20px] font-medium">Спасибо за фидбек!</h2>
              <p className="max-w-sm text-[14px] leading-relaxed" style={{ color: "rgba(255,255,255,0.6)" }}>
                Сообщение получено создателем OSGARD.
                {success.reward > 0 && (
                  <>
                    {" "}
                    На твой баланс начислено{" "}
                    <span className="font-medium" style={{ color: "#d7ae57" }}>
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
                style={{ backgroundColor: "#d7ae57", color: "#10181d" }}
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
                  <label className="mb-2 flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-[0.1em]" style={{ color: "#9eb2bc" }}>
                    <User size={13} strokeWidth={1.75} />
                    Имя
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Как к тебе обращаться?"
                    className="w-full rounded-lg px-4 py-3 text-[14px] outline-none placeholder:text-white/30"
                    style={{ backgroundColor: "#10181d", border: "1px solid #30424b", color: "#FFFFFF" }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = "#d7ae57")}
                    onBlur={(e) => (e.currentTarget.style.borderColor = "#30424b")}
                  />
                </div>
                <div>
                  <label className="mb-2 flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-[0.1em]" style={{ color: "#9eb2bc" }}>
                    <Mail size={13} strokeWidth={1.75} />
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full rounded-lg px-4 py-3 text-[14px] outline-none placeholder:text-white/30"
                    style={{ backgroundColor: "#10181d", border: "1px solid #30424b", color: "#FFFFFF" }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = "#d7ae57")}
                    onBlur={(e) => (e.currentTarget.style.borderColor = "#30424b")}
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-[12px] font-medium uppercase tracking-[0.1em]" style={{ color: "#9eb2bc" }}>
                  Сообщение
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={6}
                  placeholder="Опиши идею, баг или пожелание…"
                  className="w-full resize-none rounded-lg px-4 py-3 text-[14px] outline-none placeholder:text-white/30"
                  style={{ backgroundColor: "#10181d", border: "1px solid #30424b", color: "#FFFFFF" }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "#d7ae57")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "#30424b")}
                />
              </div>

              {error && (
                <p className="rounded-lg px-4 py-3 text-[13px]" style={{ backgroundColor: "rgba(248,113,113,0.1)", color: "#e2685c" }}>
                  {error}
                </p>
              )}

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex items-center gap-2 rounded-lg px-6 py-3 text-[14px] font-medium transition-opacity disabled:opacity-50"
                  style={{ backgroundColor: "#d7ae57", color: "#10181d" }}
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
