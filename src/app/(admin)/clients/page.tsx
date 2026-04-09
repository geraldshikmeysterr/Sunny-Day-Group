"use client";
import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Search } from "lucide-react";
import { formatDate } from "@/lib/utils";

const PAGE_SIZE = 30;

export default function GuestsPage() {
  const supabase = createClient();
  const [clients, setClients] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchClients = useCallback(async () => {
    setLoading(true);
    let q = supabase.from("profiles")
      .select("id,phone,first_name,last_name,created_at,cities(name)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (search.trim()) q = q.or(`phone.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`);
    const { data, count } = await q;
    setClients(data ?? []); setTotal(count ?? 0); setLoading(false);
  }, [page, search]);

  useEffect(() => { fetchClients(); }, [fetchClients]);
  useEffect(() => { setPage(0); }, [search]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div>
        <h1 className="text-3xl font-bold text-neutral-900">Гости</h1>
        <p className="text-sm text-neutral-500 mt-0.5">{total} зарегистрированных</p>
      </div>

      {/* Поиск на полную ширину как в Пользователи */}
      <div className="card p-4">
        <div className="relative w-full">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Поиск по имени или телефону..."
            className="input pl-8 text-sm w-full" />
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="table">
          <thead>
            <tr><th>Гость</th><th>Телефон</th><th>Город</th><th>Дата регистрации</th></tr>
          </thead>
          <tbody>
            {loading && Array.from({ length: 8 }).map((_, i) => (
              <tr key={i}>{Array.from({ length: 4 }).map((_, j) => <td key={j}><div className="skeleton h-4" /></td>)}</tr>
            ))}
            {!loading && clients.map(c => (
              <tr key={c.id}>
                <td>
                  <p className="font-medium">
                    {[c.last_name, c.first_name].filter(Boolean).join(" ") || <span className="text-neutral-400 italic">не указано</span>}
                  </p>
                  <p className="text-xs text-neutral-400 font-mono">{c.id.slice(0, 8)}</p>
                </td>
                <td className="font-mono text-sm text-neutral-600">{c.phone || "—"}</td>
                <td className="text-sm text-neutral-500">{(c.cities as any)?.name ?? "—"}</td>
                <td className="text-sm text-neutral-400 num">{formatDate(c.created_at)}</td>
              </tr>
            ))}
            {!loading && !clients.length && (
              <tr><td colSpan={4} className="py-16 text-center text-neutral-400">Гости не найдены</td></tr>
            )}
          </tbody>
        </table>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-neutral-100">
            <p className="text-sm text-neutral-500 num">{page*PAGE_SIZE+1}–{Math.min((page+1)*PAGE_SIZE,total)} из {total}</p>
            <div className="flex gap-1">
              <button onClick={() => setPage(p => Math.max(0, p-1))} disabled={page===0} className="btn-secondary btn-sm">Назад</button>
              <button onClick={() => setPage(p => Math.min(totalPages-1, p+1))} disabled={page>=totalPages-1} className="btn-secondary btn-sm">Далее</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
