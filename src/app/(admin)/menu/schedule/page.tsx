"use client";
import React, { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Check, X, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const DAYS = [
  { id: 1, name: "Пн" },
  { id: 2, name: "Вт" },
  { id: 3, name: "Ср" },
  { id: 4, name: "Чт" },
  { id: 5, name: "Пт" },
  { id: 6, name: "Сб" },
  { id: 7, name: "Вс" },
];

type MenuType = { id: string; slug: string; name: string };
type Category = { id: string; name: string; menu_type_id: string; sort_order: number };
type Item = { id: string; name: string; category_id: string; menu_type_id: string; weight_grams: number | null; active_days: number[] | null };

const getTypeName = (name: string) =>
  name === "Мороженое / Замороженные" ? "Замороженная продукция" : name;

export default function MenuSchedulePage() {
  const supabase = createClient();
  const [menuTypes, setMenuTypes] = useState<MenuType[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [activeType, setActiveType] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  // saving — Set строк вместо одной строки, чтобы несколько кнопок работали одновременно
  const [saving, setSaving] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function init() {
      setLoading(true);
      const [{ data: types }, { data: cats }, { data: mi }] = await Promise.all([
        supabase.from("menu_types").select("*"),
        supabase.from("categories").select("id,name,menu_type_id,sort_order").eq("is_active", true).order("sort_order"),
        supabase.from("menu_items").select("id,name,category_id,weight_grams,active_days,categories(menu_type_id)").eq("is_global_active", true).order("sort_order"),
      ]);
      setMenuTypes(types ?? []);
      setCategories(cats ?? []);
      const itemsData: Item[] = (mi ?? []).map((i: any) => ({
        id: i.id, name: i.name, category_id: i.category_id,
        weight_grams: i.weight_grams,
        menu_type_id: i.categories?.menu_type_id ?? "",
        active_days: i.active_days ?? [1,2,3,4,5,6,7],
      }));
      setItems(itemsData);
      if (types?.length) setActiveType(types[0].id);
      setLoading(false);
    }
    init();
  }, []);

  // Фикс: используем Set + всегда try/finally чтобы saving снимался
  async function toggleDay(itemId: string, day: number, currentDays: number[]) {
    const k = `${itemId}-${day}`;
    setSaving(p => new Set(p).add(k));
    const newDays = currentDays.includes(day)
      ? currentDays.filter(d => d !== day)
      : [...currentDays, day].sort((a, b) => a - b);
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, active_days: newDays } : i));
    try {
      const { error } = await supabase.from("menu_items").update({ active_days: newDays }).eq("id", itemId);
      if (error) {
        toast.error("Ошибка сохранения");
        setItems(prev => prev.map(i => i.id === itemId ? { ...i, active_days: currentDays } : i));
      }
    } finally {
      setSaving(p => { const n = new Set(p); n.delete(k); return n; });
    }
  }

  async function toggleAllDays(itemId: string, currentDays: number[]) {
    const k = `${itemId}-all`;
    setSaving(p => new Set(p).add(k));
    const newDays = currentDays.length === 7 ? [] : [1,2,3,4,5,6,7];
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, active_days: newDays } : i));
    try {
      await supabase.from("menu_items").update({ active_days: newDays }).eq("id", itemId);
    } finally {
      setSaving(p => { const n = new Set(p); n.delete(k); return n; });
    }
  }

  const typeItems = items.filter(i => i.menu_type_id === activeType);
  const visibleCats = categories.filter(c => c.menu_type_id === activeType);
  const grouped = visibleCats.map(cat => ({
    cat,
    items: typeItems.filter(i =>
      i.category_id === cat.id &&
      (!search || i.name.toLowerCase().includes(search.toLowerCase()))
    ),
  })).filter(g => g.items.length > 0);

  if (loading) return (
    <div className="p-6 flex items-center justify-center h-64">
      <Loader2 size={24} className="animate-spin text-brand-500" />
    </div>
  );

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-3xl font-bold text-neutral-900">По дням</h1>
        <p className="text-sm text-neutral-500 mt-1">Управляйте расписанием блюд по дням недели.</p>
      </div>

      {/* Легенда */}
      <div className="card p-4 flex flex-wrap gap-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-success-50 border border-success-200 flex items-center justify-center"><Check size={12} className="text-success-600" /></div>
          <span className="text-neutral-600">Блюдо доступно в этот день</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-neutral-100 border border-neutral-300 flex items-center justify-center"><X size={12} className="text-neutral-400" /></div>
          <span className="text-neutral-600">Блюдо скрыто в этот день</span>
        </div>
      </div>

      {/* Фильтры — sticky */}
      <div className="card p-4 flex flex-wrap gap-3 items-center sticky top-4 z-20 bg-white shadow-card">
        <div className="flex gap-2">
          {menuTypes.map(t => (
            <button key={t.id} onClick={() => setActiveType(t.id)}
              className={cn("btn btn-sm", activeType === t.id ? "btn-primary" : "btn-secondary")}>
              {getTypeName(t.name)}
            </button>
          ))}
        </div>
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Поиск блюда..." className="input pl-8 w-full text-sm" autoComplete="off" />
        </div>
      </div>

      {/* Таблица */}
      <div className="overflow-hidden rounded-2xl border border-neutral-200 shadow-card">
        <div className="overflow-x-auto bg-white">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-neutral-50">
              <tr className="border-b border-neutral-200">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500 sticky left-0 bg-neutral-50 z-10 border-r border-neutral-200" style={{ minWidth: 260 }}>
                  Блюдо
                </th>
                {DAYS.map(d => (
                  <th key={d.id} className="px-3 py-3 text-center text-xs font-semibold text-neutral-500" style={{ minWidth: 60 }}>
                    {d.name}
                  </th>
                ))}
                {/* Разделитель перед "Все" */}
                <th className="px-3 py-3 text-center text-xs font-semibold text-neutral-400 border-l border-neutral-200" style={{ minWidth: 60 }}>
                  Все
                </th>
              </tr>
            </thead>
            <tbody>
              {grouped.map(({ cat, items: catItems }) => (
                <React.Fragment key={cat.id}>
                  <tr className="bg-neutral-50/80 border-b border-neutral-200">
                    <td colSpan={9} className="px-4 py-2 sticky left-0 bg-neutral-50/80 border-r border-neutral-200 z-10">
                      <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">{cat.name}</span>
                    </td>
                  </tr>
                  {catItems.map(item => {
                    const days = item.active_days ?? [1,2,3,4,5,6,7];
                    const allActive = days.length === 7;
                    const noneActive = days.length === 0;
                    const mixed = !allActive && !noneActive;
                    return (
                      <tr key={item.id} className="border-b border-neutral-100 hover:bg-neutral-50/40 transition-colors">
                        <td className="px-4 py-3 sticky left-0 bg-white border-r border-neutral-200 z-10">
                          <p className="font-medium text-neutral-800 text-sm">{item.name}</p>
                          {item.weight_grams && <p className="text-xs text-neutral-400">{item.weight_grams} г</p>}
                        </td>
                        {DAYS.map(d => {
                          const active = days.includes(d.id);
                          const k = `${item.id}-${d.id}`;
                          const isSaving = saving.has(k);
                          return (
                            <td key={d.id} className="px-3 py-3 text-center">
                              <button
                                onClick={() => toggleDay(item.id, d.id, days)}
                                disabled={isSaving}
                                className={cn(
                                  "w-7 h-7 rounded-lg border transition-all flex items-center justify-center mx-auto",
                                  isSaving && "opacity-50 cursor-wait",
                                  active
                                    ? "bg-success-50 border-success-200 hover:bg-success-100"
                                    : "bg-neutral-100 border-neutral-300 hover:bg-neutral-200"
                                )}>
                                {isSaving
                                  ? <Loader2 size={11} className="animate-spin text-neutral-400" />
                                  : active
                                  ? <Check size={12} className="text-success-500" />
                                  : <X size={12} className="text-neutral-400" />}
                              </button>
                            </td>
                          );
                        })}
                        {/* Кнопка "все дни" с разделителем */}
                        <td className="px-3 py-3 text-center border-l border-neutral-200">
                          <button
                            onClick={() => toggleAllDays(item.id, days)}
                            disabled={saving.has(`${item.id}-all`)}
                            className={cn(
                              "w-7 h-7 rounded-lg border transition-all flex items-center justify-center mx-auto",
                              saving.has(`${item.id}-all`) && "opacity-50 cursor-wait",
                              allActive && "bg-success-50 border-success-200 hover:bg-success-100",
                              noneActive && "bg-neutral-100 border-neutral-300 hover:bg-neutral-200",
                              mixed && "bg-neutral-100 border-neutral-200 hover:bg-neutral-200"
                            )}>
                            {saving.has(`${item.id}-all`)
                              ? <Loader2 size={11} className="animate-spin text-neutral-400" />
                              : allActive
                              ? <Check size={12} className="text-success-500" />
                              : noneActive
                              ? <X size={12} className="text-neutral-400" />
                              : <span className="block w-3 h-0.5 bg-neutral-400 rounded-full" />}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
