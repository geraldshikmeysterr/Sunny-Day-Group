"use client";
import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAdmin } from "@/components/layout/AdminContext";
import { Search, ChevronDown, Check } from "lucide-react";
import { formatDate, cn } from "@/lib/utils";

const PAGE_SIZE = 30;

export default function GuestsPage() {
  const supabase = createClient();
  const { isAdmin, cityIds: opCityIds } = useAdmin() as any;
  const [clients, setClients] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [cities, setCities] = useState<{ id: string; name: string }[]>([]);
  const [cityFilter, setCityFilter] = useState<string[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);

  const showCityFilter = isAdmin || (opCityIds?.length >= 2);

  useEffect(() => {
    if (showCityFilter) {
      createClient().from("cities").select("id,name").order("name")
        .then(({ data }) => setCities(data ?? []));
    }
  }, [showCityFilter]);

  // Pre-select all operator cities
  useEffect(() => {
    if (!isAdmin && opCityIds?.length >= 2) setCityFilter(opCityIds);
  }, [isAdmin, opCityIds]);

  const fetchClients = useCallback(async () => {
    setLoading(true);
    let q = supabase.from("profiles")
      .select("id,phone,first_name,last_name,created_at,cities(name)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (search.trim()) {
      const safe = search.replaceAll(/[\\%_*]/g, String.raw`\$&`).replaceAll(/[(),.]/g, "");
      q = q.or(`phone.ilike.%${safe}%,first_name.ilike.%${safe}%,last_name.ilike.%${safe}%`);
    }
    if (cityFilter.length > 0) q = q.in("city_id", cityFilter);
    const { data, count } = await q;
    setClients(data ?? []); setTotal(count ?? 0); setLoading(false);
  }, [page, search, cityFilter]);

  useEffect(() => { fetchClients(); }, [fetchClients]);
  useEffect(() => { setPage(0); }, [search, cityFilter]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  function toggleCity(id: string) {
    setCityFilter(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div>
        <h1 className="text-3xl font-bold text-neutral-900">Гости</h1>
        <p className="text-sm text-neutral-500 mt-0.5">{total} зарегистрированных</p>
      </div>

      <div className="card p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-52">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Поиск по имени или телефону..."
            className="input pl-8 text-sm w-full" />
        </div>
        {showCityFilter && (
          <div className="relative">
            <button onClick={() => setFilterOpen(o => !o)}
              className="input text-sm text-left flex items-center justify-between gap-2 w-44 cursor-pointer">
              <span className="text-neutral-700">Города{cityFilter.length > 0 ? ` (${cityFilter.length})` : ""}</span>
              <ChevronDown size={14} className={cn("shrink-0 text-neutral-400 transition-transform", filterOpen && "rotate-180")} />
            </button>
            {filterOpen && (
              <>
                <button type="button" onClick={() => setFilterOpen(false)} className="fixed inset-0 z-10 cursor-default" />
                <div className="absolute right-0 top-11 z-20 bg-white rounded-xl shadow-card-lg border border-neutral-200 w-44 py-1 animate-scale-in max-h-64 overflow-y-auto">
                  <div className="flex gap-2 px-3 py-2 border-b border-neutral-100">
                    <button onClick={() => setCityFilter(cities.map(c => c.id))} className="text-xs text-brand-500 hover:text-brand-600">Все</button>
                    <span className="text-neutral-300">·</span>
                    <button onClick={() => setCityFilter([])} className="text-xs text-neutral-500 hover:text-neutral-700">Снять</button>
                  </div>
                  {cities.map(c => (
                    <button key={c.id} onClick={() => toggleCity(c.id)}
                      className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-left hover:bg-neutral-50">
                      <div className={cn("w-4 h-4 rounded border flex items-center justify-center shrink-0",
                        cityFilter.includes(c.id) ? "bg-brand-500 border-brand-500" : "border-neutral-300")}>
                        {cityFilter.includes(c.id) && <Check size={10} className="text-white" />}
                      </div>
                      <span className="truncate">{c.name}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="card overflow-hidden">
        <table className="table">
          <thead>
            <tr><th>Гость</th><th>Телефон</th><th>Город</th><th>Дата регистрации</th></tr>
          </thead>
          <tbody>
            {loading && Array.from({ length: 8 }, (_, i) => i).map(i => (
              <tr key={`sk-${i}`}>{Array.from({ length: 4 }, (_, j) => j).map(j => <td key={`sk-col-${j}`}><div className="skeleton h-4" /></td>)}</tr>
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
                <td className="text-sm text-neutral-500">{c.cities?.name ?? "—"}</td>
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
