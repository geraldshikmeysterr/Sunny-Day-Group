"use client";
import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Shield, ShieldCheck, ShieldOff, Loader2, Key } from "lucide-react";
import { toast } from "sonner";

type Factor = { id: string; factor_type: string; status: string; friendly_name?: string };

export default function SettingsPage() {
  const supabase = createClient();
  const [factors, setFactors] = useState<Factor[]>([]);
  const [loading, setLoading] = useState(true);

  const [enrolling, setEnrolling] = useState(false);
  const [factorId, setFactorId] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [unenrolling, setUnenrolling] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase.auth.mfa.listFactors();
      setFactors(data?.totp ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function startEnroll() {
    setEnrolling(true);
    setCode("");
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Authenticator",
    });
    if (error || !data) {
      toast.error("Ошибка: " + error?.message);
      setEnrolling(false);
      return;
    }
    setFactorId(data.id);
    setQrCode(data.totp.qr_code);
    setSecret(data.totp.secret);
  }

  async function verify() {
    if (code.length !== 6) { toast.error("Введите 6-значный код"); return; }
    setVerifying(true);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
    if (error) {
      toast.error("Неверный код");
      setVerifying(false);
      return;
    }
    toast.success("MFA успешно подключена!");
    globalThis.location.reload();
  }

  async function unenroll(id: string) {
    if (!confirm("Отключить двухфакторную аутентификацию?")) return;
    setUnenrolling(id);
    const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
    if (error) toast.error(error.message);
    else { toast.success("MFA отключена"); await load(); }
    setUnenrolling(null);
  }

  const verifiedFactors = factors.filter(f => f.status === "verified");

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-5">
      <div>
        <h1 className="text-3xl font-bold text-neutral-900">Настройки</h1>
        <p className="text-sm text-neutral-500 mt-0.5">Управление безопасностью аккаунта</p>
      </div>

      {/* MFA */}
      <div className="card p-5 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-neutral-900">Двухфакторная аутентификация</h2>
          <p className="text-xs text-neutral-400 mt-0.5">TOTP через Google Authenticator, Authy или 1Password</p>
        </div>

        {loading ? (
          <div className="skeleton h-14 rounded-xl" />
        ) : verifiedFactors.length > 0 ? (
          <div className="space-y-2">
            {verifiedFactors.map(f => (
              <div key={f.id} className="flex items-center justify-between p-3 bg-success-50 rounded-xl">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={18} className="text-success-600 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-success-800">TOTP подключён</p>
                    <p className="text-xs text-success-600">{f.friendly_name ?? "Authenticator"}</p>
                  </div>
                </div>
                <button
                  onClick={() => unenroll(f.id)}
                  disabled={unenrolling === f.id}
                  className="btn-danger btn-sm text-xs flex items-center gap-1"
                >
                  {unenrolling === f.id
                    ? <Loader2 size={12} className="animate-spin" />
                    : <ShieldOff size={12} />}
                  Отключить
                </button>
              </div>
            ))}
          </div>
        ) : !enrolling ? (
          <div className="flex items-start gap-3 p-4 bg-neutral-50 rounded-xl">
            <Shield size={20} className="text-neutral-400 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-neutral-700">Не подключена</p>
              <p className="text-xs text-neutral-400 mt-0.5">
                Защитите аккаунт вторым фактором — при входе потребуется код из приложения
              </p>
            </div>
            <button onClick={startEnroll} className="btn-primary btn-sm shrink-0">
              Подключить
            </button>
          </div>
        ) : null}

        {enrolling && qrCode && (
          <div className="space-y-5 p-4 bg-neutral-50 rounded-xl border border-neutral-200">
            <div className="space-y-3">
              <p className="text-sm font-semibold text-neutral-700">
                1. Отсканируй QR-код в приложении-аутентификаторе
              </p>
              <div className="flex justify-center">
                <img src={qrCode} alt="TOTP QR Code" className="w-44 h-44 rounded-xl border border-neutral-200 bg-white p-2" />
              </div>
              <div>
                <p className="text-xs text-neutral-500 mb-1">Или введи ключ вручную:</p>
                <div className="flex items-center gap-2 p-2.5 bg-white rounded-lg border border-neutral-200">
                  <Key size={12} className="text-neutral-400 shrink-0" />
                  <code className="text-xs text-neutral-600 break-all select-all">{secret}</code>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold text-neutral-700">
                2. Введи 6-значный код из приложения
              </p>
              <div className="flex gap-2">
                <input
                  value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="input text-center text-xl font-mono tracking-[0.4em] w-40"
                  placeholder="000000"
                  maxLength={6}
                  autoComplete="one-time-code"
                  inputMode="numeric"
                />
                <button
                  onClick={verify}
                  disabled={verifying || code.length !== 6}
                  className="btn-primary btn-md"
                >
                  {verifying ? <Loader2 size={14} className="animate-spin" /> : "Подтвердить"}
                </button>
                <button
                  onClick={async () => {
                    if (factorId) await supabase.auth.mfa.unenroll({ factorId }).catch(() => {});
                    setEnrolling(false); setQrCode(""); setSecret(""); setCode(""); setFactorId("");
                  }}
                  className="btn-secondary btn-md"
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
