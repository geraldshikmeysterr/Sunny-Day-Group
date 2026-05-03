"use client";
import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatDate, cn } from "@/lib/utils";

type FrozenOperator = {
  id: string;
  full_name: string | null;
  email: string | null;
  is_active: boolean;
  created_at: string;
};

export default function FrozenPage() {
  const supabase = createClient();

  const [frozenFeeInput, setFrozenFeeInput] = useState("");
  const [savingFee, setSavingFee] = useState(false);

  const [operators, setOperators] = useState<FrozenOperator[]>([]);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({ email: "", password: "" });
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [removing, setRemoving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: mt }, { data: ops }] = await Promise.all([
        supabase.from("menu_types").select("delivery_fee").eq("slug", "frozen").maybeSingle(),
        supabase.from("operators").select("id,full_name,email,is_active,created_at").eq("handles_frozen", true).order("created_at", { ascending: false }),
      ]);
      if (mt) { setFrozenFeeInput(String(mt.delivery_fee ?? 0)); }
      setOperators(ops ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function saveFee() {
    const val = Number.parseFloat(frozenFeeInput.replace(",", "."));
    const fee = Number.isNaN(val) || val < 0 ? 0 : val;
    setSavingFee(true);
    try {
      const { error } = await supabase.from("menu_types").update({ delivery_fee: fee }).eq("slug", "frozen");
      if (error) throw error;
      setFrozenFeeInput(String(fee));
      toast.success("Стоимость доставки сохранена");
    } catch { toast.error("Ошибка сохранения"); }
    finally { setSavingFee(false); }
  }

  async function createOperator() {
    const email = form.email.trim().toLowerCase();
    const password = form.password;

    if (!email || !password) { toast.error("Заполните email и пароль"); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast.error("Некорректный email"); return; }
    if (!/[A-Z]/.test(password) || !/\d/.test(password)) {
      toast.error("Пароль должен содержать минимум 1 заглавную букву и 1 цифру"); return;
    }

    setCreating(true);
    try {
      const { data: existing } = await supabase
        .from("operators").select("id,handles_frozen").eq("email", email).maybeSingle();

      if (existing) {
        if (existing.handles_frozen) {
          toast.info("Оператор с таким email уже назначен на заморозку");
        } else {
          const { error } = await supabase.from("operators").update({ handles_frozen: true }).eq("id", existing.id);
          if (error) throw error;
          toast.success("Существующему оператору назначена заморозка");
          await load();
          setForm({ email: "", password: "" });
          setShowForm(false);
        }
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Нет сессии");
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/create-operator`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session.access_token}`,
            "apikey": process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify({ operator_email: email, operator_password: password }),
        }
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Ошибка создания");
      await supabase.from("operators").update({ handles_frozen: true }).eq("id", body.operator.id);

      toast.success("Оператор создан");
      await load();
      setForm({ email: "", password: "" });
      setShowForm(false);
    } catch (e: any) { toast.error(e.message); }
    finally { setCreating(false); }
  }

  async function removeFromFrozen(op: FrozenOperator) {
    if (!confirm(`Снять «${op.email}» с обработки заморозки?`)) return;
    setRemoving(op.id);
    try {
      const { error } = await supabase.from("operators").update({ handles_frozen: false }).eq("id", op.id);
      if (error) throw error;
      setOperators(p => p.filter(o => o.id !== op.id));
      toast.success("Оператор снят с заморозки");
    } catch { toast.error("Ошибка"); }
    finally { setRemoving(null); }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-3xl font-bold text-neutral-900">Замороженная продукция</h1>
        <p className="text-sm text-neutral-500 mt-0.5">Настройки доставки и операторы заморозки</p>
      </div>

      {/* Delivery fee */}
      <div className="card p-5 space-y-3">
        <div>
          <p className="text-sm font-medium text-neutral-700">Стоимость доставки</p>
          <p className="text-xs text-neutral-400 mt-0.5">Единая глобальная стоимость для всех заказов заморозки</p>
        </div>
        {loading ? (
          <div className="skeleton h-10 rounded-xl w-52" />
        ) : (
          <div className="flex items-center gap-2">
            <div className="relative">
              <input
                type="number" min={0}
                value={frozenFeeInput}
                onChange={e => setFrozenFeeInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && saveFee()}
                className="input w-36 pr-8"
                placeholder="0"
                style={{ appearance: "textfield", MozAppearance: "textfield" }}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 text-sm pointer-events-none">₽</span>
            </div>
            <button onClick={saveFee} disabled={savingFee} className="btn-primary btn-sm">
              {savingFee ? <Loader2 size={14} className="animate-spin" /> : "Сохранить"}
            </button>
          </div>
        )}
      </div>

      {/* Operators */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-100">
          <div>
            <p className="text-sm font-medium text-neutral-700">Операторы заморозки</p>
            <p className="text-xs text-neutral-400 mt-0.5">Обрабатывают заказы замороженной продукции</p>
          </div>
          <button onClick={() => setShowForm(v => !v)} className="btn-primary btn-sm">
            <Plus size={14} /> Добавить
          </button>
        </div>

        {showForm && (
          <div className="px-5 py-4 border-b border-neutral-100 bg-neutral-50 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Email *</label>
                <input
                  type="email" value={form.email}
                  onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                  className="input text-sm" placeholder="operator@example.com"
                  autoComplete="off"
                />
              </div>
              <div>
                <label className="label">Пароль *</label>
                <input
                  type="password" value={form.password}
                  onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                  className="input text-sm" placeholder="Пароль *"
                  autoComplete="new-password"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={createOperator} disabled={creating} className="btn-primary btn-sm">
                {creating ? <Loader2 size={14} className="animate-spin" /> : "Создать"}
              </button>
              <button onClick={() => { setShowForm(false); setForm({ email: "", password: "" }); }} className="btn-secondary btn-sm">
                Отмена
              </button>
            </div>
          </div>
        )}

        <table className="table">
          <thead>
            <tr>
              <th className="w-full">Email</th>
              <th>Статус</th>
              <th>Создан</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && Array.from({ length: 3 }, (_, i) => i).map(i => (
              <tr key={`sk-${i}`}>{Array.from({ length: 4 }, (_, j) => j).map(j => <td key={j}><div className="skeleton h-4" /></td>)}</tr>
            ))}
            {!loading && operators.map(op => (
              <tr key={op.id} className="group">
                <td>
                  <p className="font-medium text-sm text-neutral-800">{op.email ?? "—"}</p>
                  {op.full_name && <p className="text-xs text-neutral-400">{op.full_name}</p>}
                </td>
                <td>
                  <span className={cn("badge text-xs", op.is_active ? "bg-success-50 text-success-700" : "bg-neutral-100 text-neutral-500")}>
                    {op.is_active ? "Активен" : "Неактивен"}
                  </span>
                </td>
                <td className="text-sm text-neutral-400 num whitespace-nowrap">{formatDate(op.created_at)}</td>
                <td className="w-px">
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => removeFromFrozen(op)}
                      disabled={removing === op.id}
                      title="Снять с заморозки"
                      className="btn-ghost btn-sm text-danger-500 hover:bg-danger-50"
                    >
                      {removing === op.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && !operators.length && (
              <tr><td colSpan={4} className="py-12 text-center text-neutral-400">Операторов заморозки нет</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
