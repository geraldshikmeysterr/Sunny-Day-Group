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
    <div className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "linear-gradient(135deg, #F57300 0%, #C85500 100%)" }}>
      <div className="card w-full max-w-sm p-8">

        <div className="text-center mb-8">
          <img src="/logo.png" alt="Солнечный день" className="h-10 object-contain mx-auto mb-5" />
          <p className="text-sm text-neutral-500">
            {mfaStep ? "Двухфакторная аутентификация" : "Панель управления"}
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
            <p className="text-xs text-neutral-400 text-center">Введи код из приложения-аутентификатора</p>
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
  );
}
