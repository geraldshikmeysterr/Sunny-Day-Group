"use client";
import { useState, useEffect } from "react";
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

  // Restore MFA step only if user went through password step in this browser session
  useEffect(() => {
    if (!sessionStorage.getItem("mfa_in_progress")) return;
    async function checkPendingMfa() {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.currentLevel !== "aal1" || aal?.nextLevel !== "aal2") return;
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const totp = factors?.totp?.[0];
      if (!totp) return;
      const { data: challenge } = await supabase.auth.mfa.challenge({ factorId: totp.id });
      if (!challenge) return;
      setMfaFactorId(totp.id);
      setMfaChallengeId(challenge.id);
      setMfaStep(true);
    }
    checkPendingMfa();
  }, []);

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
          sessionStorage.setItem("mfa_in_progress", "true");
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
    sessionStorage.removeItem("mfa_in_progress");
    router.push("/active-orders"); router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4">
      <div className="w-full max-w-sm rounded-2xl p-8 shadow-xl"
        style={{ background: "#F57300" }}>

        <div className="text-center mb-8">
          <img src="/logo.png" alt="Солнечный день" className="h-12 object-contain mx-auto mb-3" />
          <p className="text-sm text-white/70">Панель управления</p>
        </div>

        {!mfaStep ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-white/80 mb-1">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="operator@city.ru" required
                className="w-full px-3 py-2.5 rounded-xl text-sm bg-white/15 text-white placeholder-white/40 border border-white/25 outline-none focus:bg-white/25 focus:border-white/50 transition" />
            </div>
            <div>
              <label className="block text-xs font-medium text-white/80 mb-1">Пароль</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" required
                className="w-full px-3 py-2.5 rounded-xl text-sm bg-white/15 text-white placeholder-white/40 border border-white/25 outline-none focus:bg-white/25 focus:border-white/50 transition" />
            </div>
            {error && (
              <div className="text-sm text-white bg-white/20 px-3 py-2.5 rounded-xl">{error}</div>
            )}
            <button type="submit" disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-white text-orange-500 font-semibold text-sm py-2.5 rounded-xl hover:bg-white/90 transition mt-2 disabled:opacity-60">
              {loading && <Loader2 size={14} className="animate-spin" />}
              {loading ? "Вход..." : "Войти"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleMfa} className="space-y-4">
            <div className="text-center space-y-1">
              <p className="text-sm font-medium text-white">Двухфакторная аутентификация</p>
              <p className="text-xs text-white/60">Введи код из приложения-аутентификатора</p>
            </div>
            <input
              value={mfaCode}
              onChange={e => setMfaCode(e.target.value.replaceAll(/\D/g, "").slice(0, 6))}
              className="w-full py-2.5 rounded-xl text-center text-2xl font-mono bg-white/15 text-white placeholder-white/40 border border-white/25 outline-none focus:bg-white/25 focus:border-white/50 transition"
              style={{ letterSpacing: "0.5em", paddingLeft: "0.5em", paddingRight: "0.5em" }}
              placeholder="000000"
              maxLength={6}
              autoComplete="one-time-code"
              inputMode="numeric"
              autoFocus
            />
            {error && (
              <div className="text-sm text-white bg-white/20 px-3 py-2.5 rounded-xl">{error}</div>
            )}
            <button type="submit" disabled={mfaLoading || mfaCode.length !== 6}
              className="w-full flex items-center justify-center gap-2 bg-white text-orange-500 font-semibold text-sm py-2.5 rounded-xl hover:bg-white/90 transition disabled:opacity-60">
              {mfaLoading && <Loader2 size={14} className="animate-spin" />}
              {mfaLoading ? "Проверка..." : "Подтвердить"}
            </button>
            <button type="button" onClick={() => { sessionStorage.removeItem("mfa_in_progress"); setMfaStep(false); setMfaCode(""); setError(""); }}
              className="w-full text-sm text-white/70 hover:text-white py-2 transition">
              Назад
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
