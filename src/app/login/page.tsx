"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Loader2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [mfaFactorId, setMfaFactorId] = useState("");
  const [mfaChallengeId, setMfaChallengeId] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaStep, setMfaStep] = useState(false);
  const [mfaLoading, setMfaLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError("");
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) { setError("Неверный email или пароль"); setLoading(false); return; }

    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel === "aal1" && aal?.nextLevel === "aal2") {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const totp = factors?.totp?.[0];
      if (totp) {
        const { data: challenge } = await supabase.auth.mfa.challenge({ factorId: totp.id });
        if (challenge) {
          setMfaFactorId(totp.id);
          setMfaChallengeId(challenge.id);
          setMfaStep(true);
          setLoading(false);
          return;
        }
      }
    }

    router.push("/active-orders"); router.refresh();
  }

  async function handleMfa(e: React.FormEvent) {
    e.preventDefault();
    if (mfaCode.length !== 6) return;
    setMfaLoading(true); setError("");
    const supabase = createClient();
    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId: mfaFactorId,
      challengeId: mfaChallengeId,
      code: mfaCode,
    });
    if (verifyError) { setError("Неверный код"); setMfaLoading(false); return; }
    router.push("/active-orders"); router.refresh();
  }

  return (
    <div className="min-h-screen flex">
      {/* Левая панель */}
      <div className="hidden lg:flex lg:w-[420px] xl:w-[480px] flex-col justify-between p-10 shrink-0"
        style={{ background: "linear-gradient(160deg, #F57300 0%, #C85500 100%)" }}>
        <img src="/logo.png" alt="Солнечный день" className="h-10 object-contain object-left" />
        <div>
          <p className="text-white/60 text-sm font-medium uppercase tracking-widest mb-3">Панель управления</p>
          <p className="text-white text-3xl font-bold leading-snug">
            Управляй заказами,<br />меню и городами<br />в одном месте
          </p>
        </div>
        <p className="text-white/40 text-xs">© 2025 Солнечный день</p>
      </div>

      {/* Правая панель */}
      <div className="flex-1 flex items-center justify-center bg-neutral-100 px-4 py-12">
        <div className="w-full max-w-sm">
          {/* Логотип на мобильных */}
          <div className="flex justify-center mb-8 lg:hidden">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #F57300, #E06500)" }}>
              <img src="/logo.png" alt="Солнечный день" className="h-8 w-8 object-contain" />
            </div>
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-bold text-neutral-900">
              {mfaStep ? "Двухфакторная аутентификация" : "Добро пожаловать"}
            </h1>
            <p className="text-sm text-neutral-500 mt-1">
              {mfaStep ? "Введи код из приложения-аутентификатора" : "Войди в панель управления"}
            </p>
          </div>

          {!mfaStep ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="label">Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="operator@city.ru" required className="input" />
              </div>
              <div>
                <label className="label">Пароль</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" required className="input" />
              </div>
              {error && (
                <div className="text-sm text-danger-600 bg-danger-50 px-3 py-2.5 rounded-lg">{error}</div>
              )}
              <button type="submit" disabled={loading} className="btn-primary btn-md w-full mt-2">
                {loading && <Loader2 size={14} className="animate-spin" />}
                {loading ? "Вход..." : "Войти"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleMfa} className="space-y-4">
              <input
                value={mfaCode}
                onChange={e => setMfaCode(e.target.value.replaceAll(/\D/g, "").slice(0, 6))}
                className="input text-center text-2xl font-mono tracking-[0.5em] pl-[0.5em] w-full"
                placeholder="000000"
                maxLength={6}
                autoComplete="one-time-code"
                inputMode="numeric"
                autoFocus
              />
              {error && (
                <div className="text-sm text-danger-600 bg-danger-50 px-3 py-2.5 rounded-lg">{error}</div>
              )}
              <button type="submit" disabled={mfaLoading || mfaCode.length !== 6} className="btn-primary btn-md w-full">
                {mfaLoading && <Loader2 size={14} className="animate-spin" />}
                {mfaLoading ? "Проверка..." : "Подтвердить"}
              </button>
              <button type="button" onClick={() => { setMfaStep(false); setMfaCode(""); setError(""); }}
                className="btn-secondary btn-md w-full">
                Назад
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
