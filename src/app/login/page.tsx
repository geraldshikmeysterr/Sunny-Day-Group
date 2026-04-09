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

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError("");
    const { error } = await createClient().auth.signInWithPassword({ email, password });
    if (error) { setError("Неверный email или пароль"); setLoading(false); return; }
    router.push("/active-orders"); router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-100">
      <div className="card w-full max-w-sm p-8">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: "linear-gradient(135deg, #F57300, #E06500)" }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="5" fill="#FFE32B"/>
              <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
                stroke="#FFE32B" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-neutral-900">Солнечный день</h1>
          <p className="text-sm text-neutral-500 mt-1">Панель управления</p>
        </div>
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
      </div>
    </div>
  );
}
