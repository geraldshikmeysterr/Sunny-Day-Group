"use client";
import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Shield, ShieldCheck, ShieldOff, Loader2, Key } from "lucide-react";
import { toast } from "sonner";
import { useAdmin } from "@/components/layout/AdminContext";

type Factor = { id: string; factor_type: string; status: string; friendly_name?: string };

export default function SettingsPage() {
  const supabase = createClient();
  const { isAdmin } = useAdmin();
  const [factors, setFactors] = useState<Factor[]>([]);
  const [loading, setLoading] = useState(true);

  const [frozenFee, setFrozenFee] = useState<number | null>(null);
  const [frozenFeeInput, setFrozenFeeInput] = useState("");
  const [savingFee, setSavingFee] = useState(false);

  const [enrolling, setEnrolling] = useState(false);
  const [factorId, setFactorId] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);

  const [unenrollConfirm, setUnenrollConfirm] = useState<{ factorId: string; challengeId: string; token: string } | null>(null);
  const [unenrollCode, setUnenrollCode] = useState("");
  const [unenrolling, setUnenrolling] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: factorsData }, { data: mt }] = await Promise.all([
        supabase.auth.mfa.listFactors(),
        supabase.from("menu_types").select("delivery_fee").eq("slug", "frozen").maybeSingle(),
      ]);
      setFactors(factorsData?.totp ?? []);
      if (mt != null) {
        setFrozenFee(mt.delivery_fee ?? 0);
        setFrozenFeeInput(String(mt.delivery_fee ?? 0));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function saveFrozenFee() {
    const val = Number.parseFloat(frozenFeeInput.replace(",", "."));
    const fee = Number.isNaN(val) || val < 0 ? 0 : val;
    setSavingFee(true);
    try {
      const { error } = await supabase.from("menu_types").update({ delivery_fee: fee }).eq("slug", "frozen");
      if (error) throw error;
      setFrozenFee(fee);
      setFrozenFeeInput(String(fee));
      toast.success("Стоимость доставки заморозки сохранена");
    } catch { toast.error("Ошибка сохранения"); }
    finally { setSavingFee(false); }
  }

  async function startEnroll() {
    setEnrolling(true);
    setCode("");
    const { data: existing } = await supabase.auth.mfa.listFactors();
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    const pending = (existing?.totp ?? []).filter(f => f.status !== "verified");
    if (token) {
      for (const f of pending) {
        await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/factors/${f.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}`, apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
        }).catch(() => {});
      }
    }
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
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
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) { toast.error("Сессия истекла"); setVerifying(false); return; }
    const challengeRes = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/factors/${factorId}/challenge`,
      { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! }, body: "{}" }
    );
    if (!challengeRes.ok) { toast.error("Ошибка"); setVerifying(false); return; }
    const { id: challengeId } = await challengeRes.json();
    const verifyRes = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/factors/${factorId}/verify`,
      { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! }, body: JSON.stringify({ challenge_id: challengeId, code }) }
    );
    if (!verifyRes.ok) { toast.error("Неверный код"); setVerifying(false); return; }
    toast.success("MFA успешно подключена!");
    globalThis.location.reload();
  }

  async function startUnenroll(id: string) {
    const { data: session } = await supabase.auth.getSession();
    const token = session?.session?.access_token;
    if (!token) { toast.error("Сессия истекла, войдите заново"); return; }
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/factors/${id}/challenge`,
      { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! }, body: "{}" }
    );
    if (!res.ok) { toast.error("Ошибка создания challenge"); return; }
    const { id: challengeId } = await res.json();
    setUnenrollConfirm({ factorId: id, challengeId, token });
    setUnenrollCode("");
  }

  async function confirmUnenroll() {
    if (!unenrollConfirm || unenrollCode.length !== 6) return;
    setUnenrolling(true);
    try {
      const verifyRes = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/factors/${unenrollConfirm.factorId}/verify`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${unenrollConfirm.token}`,
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify({ challenge_id: unenrollConfirm.challengeId, code: unenrollCode }),
        }
      );
      if (!verifyRes.ok) { toast.error("Неверный код"); return; }
      const verifyData = await verifyRes.json();

      const deleteRes = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/factors/${unenrollConfirm.factorId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${verifyData.access_token}`,
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
        }
      );
      if (!deleteRes.ok) {
        const body = await deleteRes.json().catch(() => ({}));
        toast.error(body.message ?? "Ошибка при отключении");
        return;
      }
      toast.success("MFA отключена");
      globalThis.location.reload();
    } finally {
      setUnenrolling(false);
    }
  }

  const verifiedFactors = factors.filter(f => f.status === "verified");

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-5">
      <div>
        <h1 className="text-3xl font-bold text-neutral-900">Настройки</h1>
        <p className="text-sm text-neutral-500 mt-0.5">Управление безопасностью аккаунта</p>
      </div>

      {isAdmin && (
        <div className="card p-5 space-y-4">
          <div>
            <p className="text-sm text-neutral-700">Стоимость доставки заморозки</p>
            <p className="text-xs text-neutral-400 mt-0.5">Единая глобальная стоимость для всех заказов заморозки</p>
          </div>
          {loading ? (
            <div className="skeleton h-10 rounded-xl" />
          ) : (
            <div className="flex items-center gap-2">
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  value={frozenFeeInput}
                  onChange={e => setFrozenFeeInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && saveFrozenFee()}
                  className="input w-36 pr-8"
                  placeholder="0"
                  style={{ appearance: "textfield", MozAppearance: "textfield" }}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 text-sm pointer-events-none">₽</span>
              </div>
              <button
                onClick={saveFrozenFee}
                disabled={savingFee}
                className="btn-primary btn-sm"
              >
                {savingFee ? <Loader2 size={14} className="animate-spin" /> : "Сохранить"}
              </button>
              {frozenFee !== null && (
                <span className="text-xs text-neutral-400">
                  Текущая: {frozenFee} ₽
                </span>
              )}
            </div>
          )}
        </div>
      )}

      <div className="card p-5 space-y-4">
        <div>
          <p className="text-sm text-neutral-700">Двухфакторная аутентификация</p>
          <p className="text-xs text-neutral-400 mt-0.5">TOTP через Google Authenticator, Authy или 1Password</p>
        </div>

        {loading ? (
          <div className="skeleton h-14 rounded-xl" />
        ) : verifiedFactors.length > 0 ? (
          <div className="space-y-2">
            {verifiedFactors.map(f => (
              <div key={f.id} className="flex items-start gap-3 p-4 bg-neutral-50 rounded-xl">
                <ShieldCheck size={20} className="text-neutral-600 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-neutral-700">Подключена</p>
                  <p className="text-xs text-neutral-400 mt-0.5">{f.friendly_name ?? "Authenticator"}</p>
                </div>
                {unenrollConfirm?.factorId === f.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      value={unenrollCode}
                      onChange={e => setUnenrollCode(e.target.value.replaceAll(/\D/g, "").slice(0, 6))}
                      className="input text-center font-mono w-28 text-sm"
                      placeholder="000000"
                      maxLength={6}
                      inputMode="numeric"
                      autoFocus
                    />
                    <button
                      onClick={confirmUnenroll}
                      disabled={unenrolling || unenrollCode.length !== 6}
                      className="btn-danger btn-sm flex items-center gap-1"
                    >
                      {unenrolling ? <Loader2 size={12} className="animate-spin" /> : <ShieldOff size={12} />}
                      Подтвердить
                    </button>
                    <button
                      onClick={() => setUnenrollConfirm(null)}
                      className="btn-secondary btn-sm"
                    >
                      Отмена
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => startUnenroll(f.id)}
                    className="btn-danger btn-sm text-xs flex items-center gap-1 shrink-0"
                  >
                    <ShieldOff size={12} /> Отключить
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : enrolling ? null : (
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
        )}

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
                  onChange={e => setCode(e.target.value.replaceAll(/\D/g, "").slice(0, 6))}
                  className="input text-center text-xl font-mono tracking-[0.4em] pl-[0.4em] w-40"
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
                    if (factorId) {
                      const { data: s } = await supabase.auth.getSession();
                      const token = s?.session?.access_token;
                      if (token) {
                        await fetch(
                          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/factors/${factorId}`,
                          { method: "DELETE", headers: { Authorization: `Bearer ${token}`, apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! } }
                        ).catch(() => {});
                      }
                    }
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
