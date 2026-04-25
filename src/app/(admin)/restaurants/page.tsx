"use client";
import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAdmin } from "@/components/layout/AdminContext";
import { Plus, Edit2, X, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { CustomSelect, MultiSelect } from "@/components/CustomSelect";

const EMPTY = { address: "", working_hours: "", coords: "", is_active: false, city_id: "" };

export default function RestaurantsPage() {
  const { isAdmin, cityIds: opCityIds } = useAdmin() as any;
  const supabase = createClient();
  const [restaurants, setRestaurants] = useState<any[]>([]);
  const [cities, setCities] = useState<any[]>([]);
  const [cityFilters, setCityFilters] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ open: boolean; editing: any | null }>({ open: false, editing: null });
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const showCityFilter = isAdmin || opCityIds.length >= 2;

  useEffect(() => {
    if (showCityFilter) createClient().from("cities").select("id,name").order("name").then(({ data }) => setCities(data ?? []));
  }, [showCityFilter]);

  const fetchRestaurants = useCallback(async () => {
    setLoading(true);
    let q = supabase.from("restaurants").select("*").order("address");
    if (!isAdmin && opCityIds.length > 0) q = q.in("city_id", opCityIds);
    const { data } = await q;
    setRestaurants(data ?? []); setLoading(false);
  }, [isAdmin, opCityIds]);

  useEffect(() => { fetchRestaurants(); }, [fetchRestaurants]);

  useEffect(() => {
    if (!isAdmin && opCityIds.length >= 2) setCityFilters(opCityIds);
  }, [isAdmin, opCityIds]);

  function openAdd() {
    setForm({ ...EMPTY, city_id: opCityIds[0] ?? cities[0]?.id ?? "" });
    setModal({ open: true, editing: null });
  }
  function openEdit(r: any) {
    setForm({
      address: r.address, working_hours: r.working_hours ?? "",
      coords: r.lat != null && r.lng != null ? `${r.lat}, ${r.lng}` : "",
      is_active: r.is_active, city_id: r.city_id,
    });
    setModal({ open: true, editing: r });
  }

  async function save() {
    setSaving(true);
    const [rawLat, rawLng] = form.coords.split(",").map(s => s.trim());
    const payload = {
      address: form.address,
      working_hours: form.working_hours || null,
      lat: rawLat ? Number.parseFloat(rawLat) : null,
      lng: rawLng ? Number.parseFloat(rawLng) : null,
      is_active: form.is_active,
      city_id: form.city_id || opCityIds[0],
    };
    if (modal.editing) await supabase.from("restaurants").update(payload).eq("id", modal.editing.id);
    else await supabase.from("restaurants").insert(payload);
    toast.success(modal.editing ? "Ресторан обновлён" : "Ресторан добавлен");
    setModal({ open: false, editing: null }); await fetchRestaurants(); setSaving(false);
  }

  const getCityName = (id: string) => cities.find(c => c.id === id)?.name ?? "—";
  const colCount = showCityFilter ? 5 : 4;
  const filtered = restaurants.filter(r => {
    const matchSearch = !search || r.address.toLowerCase().includes(search.toLowerCase());
    const matchCity = !showCityFilter || cityFilters.length === 0 || cityFilters.includes(r.city_id);
    return matchSearch && matchCity;
  });
  const cityOptions = cities.map(c => ({ value: c.id, label: c.name }));

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold text-neutral-900">Рестораны</h1><p className="text-sm text-neutral-500 mt-0.5">Точки сети</p></div>
        {isAdmin && <button onClick={openAdd} className="btn-primary btn-md"><Plus size={16} /> Добавить</button>}
      </div>
      <div className="card p-4 flex flex-wrap gap-3 items-center sticky top-4 z-20 bg-white shadow-card">
        <div className="relative flex-1 min-w-52">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск по адресу..." className="input pl-8 text-sm" autoComplete="off" />
        </div>
        {showCityFilter && <MultiSelect values={cityFilters} onChange={setCityFilters} options={cityOptions} className="w-48" placeholder="Все города" />}
      </div>
      <div className="card overflow-hidden">
        <table className="table">
          <thead>
            <tr>
              {showCityFilter && <th>Город</th>}
              <th>Адрес</th>
              <th>Часы работы</th>
              <th>Статус</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && Array.from({ length: 4 }, (_, i) => i).map(i => (
              <tr key={`sk-${i}`}>{Array.from({ length: colCount }, (_, j) => j).map(j => <td key={`sk-col-${j}`}><div className="skeleton h-4" /></td>)}</tr>
            ))}
            {!loading && filtered.map(r => (
              <tr key={r.id}>
                {showCityFilter && <td><span className="badge text-xs bg-sun-100 text-brand-700">{getCityName(r.city_id)}</span></td>}
                <td className="text-sm text-neutral-700">{r.address}</td>
                <td className="text-sm text-neutral-500 whitespace-nowrap">{r.working_hours ?? "—"}</td>
                <td><span className={cn("badge text-xs", r.is_active ? "bg-success-50 text-success-700" : "bg-neutral-100 text-neutral-500")}>{r.is_active ? "Открыт" : "Закрыт"}</span></td>
                <td>
                  {isAdmin && <button onClick={() => openEdit(r)} className="btn-ghost btn-sm text-brand-500"><Edit2 size={14} /></button>}
                </td>
              </tr>
            ))}
            {!loading && !filtered.length && <tr><td colSpan={colCount} className="py-16 text-center text-neutral-400">Нет ресторанов</td></tr>}
          </tbody>
        </table>
      </div>

      {modal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-card-lg w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
              <h2 className="text-xl font-semibold">{modal.editing ? "Редактировать ресторан" : "Новый ресторан"}</h2>
              <button onClick={() => setModal({ open: false, editing: null })} className="btn-ghost btn-sm"><X size={16} /></button>
            </div>
            <div className="p-6 space-y-3">
              {isAdmin && (
                <div>
                  <p className="label">Город *</p>
                  <CustomSelect value={form.city_id} onChange={v => setForm(p => ({ ...p, city_id: v }))} options={cities.map(c => ({ value: c.id, label: c.name }))} />
                </div>
              )}
              <div>
                <label htmlFor="rest-address" className="label">Адрес *</label>
                <input id="rest-address" value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} className="input" placeholder="ул. Писарева, д. 1" autoComplete="off" />
              </div>
              <div>
                <label htmlFor="rest-hours" className="label">Часы работы</label>
                <input id="rest-hours" value={form.working_hours} onChange={e => setForm(p => ({ ...p, working_hours: e.target.value }))} className="input" placeholder="09:00–22:00" autoComplete="off" />
              </div>
              <div>
                <label htmlFor="rest-coords" className="label">Координаты</label>
                <input id="rest-coords" value={form.coords} onChange={e => setForm(p => ({ ...p, coords: e.target.value }))} className="input" placeholder="00.000000, 00.000000" autoComplete="off" />
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.is_active} onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))} className="w-4 h-4 rounded accent-brand-500" />
                Открыт
              </label>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-neutral-200">
              <button onClick={() => setModal({ open: false, editing: null })} className="btn-secondary btn-md">Отмена</button>
              <button onClick={save} disabled={saving || !form.address} className="btn-primary btn-md">
                {saving && <Loader2 size={14} className="animate-spin" />} Сохранить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
