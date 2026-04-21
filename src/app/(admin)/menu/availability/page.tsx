"use client";
import React, { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAdmin } from "@/components/layout/AdminContext";
import { Check, X, Edit3, Loader2, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type City     = { id: string; name: string };
type MenuType = { id: string; slug: string; name: string };
type Category = { id: string; name: string; menu_type_id: string; sort_order: number };
type Item     = { id: string; name: string; category_id: string; menu_type_id: string; weight_grams: number | null };
type Cell     = { is_available: boolean; price: number };
type Matrix   = Record<string, Record<string, Cell>>; // matrix[item_id][city_id]

function FilterDropdown({ label, options, selected, onToggle, onSelectAll, onClearAll }: Readonly<{
  label: string; options: { id: string; name: string }[]; selected: Set<string>;
  onToggle: (id: string) => void; onSelectAll: () => void; onClearAll: () => void;
}>) {
  const [open, setOpen] = useState(false);
  const count = selected.size;
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)}
        className="input text-sm text-left flex items-center justify-between gap-2 w-44 cursor-pointer">
        <span className="text-neutral-700">{label}{count > 0 ? ` (${count})` : ""}</span>
        <ChevronDown size={14} className={cn("shrink-0 text-neutral-400 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <>
          <button type="button" aria-label="Закрыть" onClick={() => setOpen(false)} className="fixed inset-0 z-10 cursor-default" />
          <div className="absolute right-0 top-11 z-20 bg-white rounded-xl shadow-card-lg border border-neutral-200 w-44 py-1 animate-scale-in max-h-64 overflow-y-auto">
            <div className="flex gap-2 px-3 py-2 border-b border-neutral-100">
              <button onClick={onSelectAll} className="text-xs text-brand-500 hover:text-brand-600">Все</button>
              <span className="text-neutral-300">·</span>
              <button onClick={onClearAll} className="text-xs text-neutral-500 hover:text-neutral-700">Снять</button>
            </div>
            {options.map(opt => (
              <button key={opt.id} onClick={() => onToggle(opt.id)}
                className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-left hover:bg-neutral-50">
                <div className={cn("w-4 h-4 rounded border flex items-center justify-center shrink-0",
                  selected.has(opt.id) ? "bg-brand-500 border-brand-500" : "border-neutral-300")}>
                  {selected.has(opt.id) && <Check size={10} className="text-white" />}
                </div>
                <span className="truncate">{opt.name}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const getTypeName = (name: string) =>
  name === "Мороженое / Замороженные" ? "Замороженная продукция" : name;

export default function AvailabilityPage() {
  const { isAdmin, cityId: opCityId, loaded } = useAdmin() as any;
  const supabase = createClient();

  const [allCities,   setAllCities]   = useState<City[]>([]);
  const [menuTypes,   setMenuTypes]   = useState<MenuType[]>([]);
  const [categories,  setCategories]  = useState<Category[]>([]);
  const [items,       setItems]       = useState<Item[]>([]);
  const [matrix,      setMatrix]      = useState<Matrix>({});
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState<string | null>(null);
  const [search,      setSearch]      = useState("");
  const [activeType,  setActiveType]  = useState("");
  const [selectedCities, setSelectedCities] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<{ itemId: string; cityId: string } | null>(null);
  const [priceInput, setPriceInput] = useState("");

  const load = useCallback(async () => {
    if (!loaded) return;
    setLoading(true);
    const [cityRes, typeRes, catRes, itemRes, cmi0, cmi1, cmi2, cmi3] = await Promise.all([
      supabase.from("cities").select("id,name").order("name"),
      supabase.from("menu_types").select("*"),
      supabase.from("categories").select("id,name,menu_type_id,sort_order").eq("is_active", true).order("sort_order"),
      supabase.from("menu_items").select("id,name,category_id,weight_grams,categories(menu_type_id)").eq("is_global_active", true).order("sort_order"),
      supabase.from("city_menu_items").select("city_id,menu_item_id,price,is_available").range(0, 999),
      supabase.from("city_menu_items").select("city_id,menu_item_id,price,is_available").range(1000, 1999),
      supabase.from("city_menu_items").select("city_id,menu_item_id,price,is_available").range(2000, 2999),
      supabase.from("city_menu_items").select("city_id,menu_item_id,price,is_available").range(3000, 3999),
    ]);
    const cmiRes = { data: [...(cmi0.data ?? []), ...(cmi1.data ?? []), ...(cmi2.data ?? []), ...(cmi3.data ?? [])] };

    const cities = cityRes.data ?? [];
    const types  = typeRes.data ?? [];
    setAllCities(cities);
    setMenuTypes(types);
    setCategories(catRes.data ?? []);

    const itemsData: Item[] = (itemRes.data ?? []).map((i: any) => ({
      id: i.id, name: i.name, category_id: i.category_id,
      weight_grams: i.weight_grams,
      menu_type_id: i.categories?.menu_type_id ?? "",
    }));
    setItems(itemsData);

    if (types.length) setActiveType(types[0].id);

    const m: Matrix = {};
    for (const row of cmiRes.data ?? []) {
      if (!m[row.menu_item_id]) m[row.menu_item_id] = {};
      m[row.menu_item_id][row.city_id] = { is_available: row.is_available, price: row.price };
    }
    setMatrix(m);

    if (!isAdmin && opCityId) {
      setSelectedCities(new Set([opCityId]));
    } else {
      setSelectedCities(new Set());
    }

    setLoading(false);
  }, [loaded, isAdmin, opCityId]);

  useEffect(() => { load(); }, [load]);

  function toggleCityFilter(id: string) {
    setSelectedCities(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  async function toggleItem(itemId: string, cityId: string) {
    const cur    = matrix[itemId]?.[cityId];
    const newVal = cur ? !cur.is_available : true;
    const k      = `${itemId}_${cityId}`;
    setMatrix(p => ({ ...p, [itemId]: { ...p[itemId], [cityId]: { is_available: newVal, price: cur?.price ?? 0 } } }));
    setSaving(k);
    try {
      await supabase.from("city_menu_items")
        .upsert({ city_id: cityId, menu_item_id: itemId, is_available: newVal, price: cur?.price ?? 0 },
          { onConflict: "city_id,menu_item_id" });
      toast.success(newVal ? "Блюдо включено" : "Блюдо скрыто");
    } catch {
      setMatrix(p => ({ ...p, [itemId]: { ...p[itemId], [cityId]: { is_available: !newVal, price: cur?.price ?? 0 } } }));
      toast.error("Ошибка");
    } finally { setSaving(null); }
  }

  async function savePrice(itemId: string, cityId: string) {
    const rubles = Number.parseFloat(priceInput.replace(",", "."));
    const price  = !priceInput.trim() || Number.isNaN(rubles) || rubles < 0 ? 0 : rubles;
    const cur    = matrix[itemId]?.[cityId];
    setSaving(`price_${itemId}_${cityId}`);
    try {
      await supabase.from("city_menu_items")
        .upsert({ city_id: cityId, menu_item_id: itemId, is_available: cur?.is_available ?? true, price },
          { onConflict: "city_id,menu_item_id" });
      setMatrix(p => ({ ...p, [itemId]: { ...p[itemId], [cityId]: { is_available: cur?.is_available ?? true, price } } }));
      toast.success(price > 0 ? `Цена: ${price} ₽` : "Цена сброшена");
    } catch { toast.error("Ошибка"); }
    finally { setSaving(null); setEditing(null); }
  }

  const visibleCities = allCities.filter(c => selectedCities.has(c.id));

  const typeItems = items.filter(i => i.menu_type_id === activeType);
  const visibleCats = categories.filter(c => c.menu_type_id === activeType);

  const grouped = visibleCats.map(cat => ({
    cat,
    items: typeItems.filter(i =>
      i.category_id === cat.id &&
      (!search || cat.name.toLowerCase().includes(search.toLowerCase()) || i.name.toLowerCase().includes(search.toLowerCase()))
    ),
  })).filter(g => g.items.length > 0);

  if (!loaded || loading) return (
    <div className="p-6 flex items-center justify-center h-64">
      <Loader2 size={24} className="animate-spin text-brand-500" />
    </div>
  );

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-3xl font-bold text-neutral-900">По городам</h1>
        <p className="text-sm text-neutral-500 mt-1">Управляйте доступностью и ценами для каждого города.</p>
      </div>

      <div className="card p-4 flex flex-wrap gap-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-success-50 border border-success-200 flex items-center justify-center"><Check size={12} className="text-success-600" /></div>
          <span className="text-neutral-600">Цена назначена</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-brand-50 border border-brand-200 flex items-center justify-center"><Check size={12} className="text-brand-600" /></div>
          <span className="text-neutral-600">Активно (без цены)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-neutral-100 border border-neutral-300 flex items-center justify-center"><X size={12} className="text-neutral-400" /></div>
          <span className="text-neutral-600">Скрыто</span>
        </div>
      </div>

      <div className="card p-4 flex flex-wrap gap-3 items-center sticky top-4 z-20 bg-white shadow-card">
        <div className="flex gap-2">
          {menuTypes.map(t => (
            <button key={t.id} onClick={() => setActiveType(t.id)}
              className={cn("btn btn-sm", activeType === t.id ? "btn-primary" : "btn-secondary")}>
              {getTypeName(t.name)}
            </button>
          ))}
        </div>

        <div className="relative flex-1 min-w-64">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Поиск по блюду или категории..."
            className="input pl-8 text-sm" />
        </div>

        {isAdmin && (
          <FilterDropdown
            label="Города"
            options={allCities}
            selected={selectedCities}
            onToggle={toggleCityFilter}
            onSelectAll={() => setSelectedCities(new Set(allCities.map(c => c.id)))}
            onClearAll={() => setSelectedCities(new Set())}
          />
        )}
      </div>

      {visibleCities.length === 0 ? (
        <div className="card p-12 text-center text-neutral-400">
          <p className="text-base font-medium mb-1">Выберите города</p>
          <p className="text-sm">Используйте фильтр «Города» чтобы добавить колонки в таблицу</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-neutral-200 shadow-card">
          <div className="overflow-x-auto bg-white">
            <table className="w-full text-sm border-collapse min-w-full">
              <thead className="bg-neutral-50">
                <tr className="border-b border-neutral-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500 min-w-64 sticky left-0 bg-neutral-50 z-10 border-r border-neutral-200">
                    Блюдо / Базовая цена
                  </th>
                  {visibleCities.map(city => (
                    <th key={city.id} className="px-3 py-3 text-center text-xs font-semibold text-neutral-500 min-w-40">
                      {city.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grouped.map(({ cat, items: catItems }) => (
                  <React.Fragment key={cat.id}>
                    <tr className="bg-neutral-50/80 border-b border-neutral-200">
                      <td className="px-4 py-2 sticky left-0 bg-neutral-50/80 border-r border-neutral-200 z-10">
                        <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">{cat.name}</span>
                      </td>
                      {visibleCities.map(city => (
                        <td key={city.id} className="px-3 py-1.5 text-center">
                          <span className="text-neutral-300 text-xs">—</span>
                        </td>
                      ))}
                    </tr>
                    {catItems.map(item => (
                      <tr key={item.id} className="border-b border-neutral-100 hover:bg-neutral-50/40 group">
                        <td className="px-4 py-3 sticky left-0 bg-white group-hover:bg-neutral-50/60 border-r border-neutral-200 z-10 pl-8">
                          <p className="font-medium text-neutral-800">{item.name}</p>
                          {item.weight_grams && (
                            <span className="text-xs text-neutral-400">{item.weight_grams} г</span>
                          )}
                        </td>
                        {visibleCities.map(city => {
                          const cell       = matrix[item.id]?.[city.id];
                          const isAvail    = cell?.is_available ?? false;
                          const hasPrice   = (cell?.price ?? 0) > 0;
                          const isSaving   = saving === `${item.id}_${city.id}` || saving === `price_${item.id}_${city.id}`;
                          const isEditing  = editing?.itemId === item.id && editing?.cityId === city.id;
                          return (
                            <td key={city.id} className="px-3 py-2 text-center">
                              <div className="flex flex-col items-center gap-1">
                                <button
                                  onClick={() => toggleItem(item.id, city.id)}
                                  disabled={!!saving}
                                  title={isAvail ? "Скрыть" : "Включить"}
                                  className={cn(
                                    "w-7 h-7 rounded-lg border transition-all flex items-center justify-center",
                                    isSaving && "opacity-50 cursor-wait",
                                    cell && isAvail
                                      ? (hasPrice ? "bg-success-50 border-success-200 hover:bg-success-100" : "bg-brand-50 border-brand-200 hover:bg-brand-100")
                                      : "bg-neutral-100 border-neutral-300 hover:bg-neutral-200"
                                  )}>
                                  {isSaving
                                    ? <Loader2 size={12} className="animate-spin text-neutral-400" />
                                    : isAvail
                                    ? <Check size={12} className={hasPrice ? "text-success-500" : "text-brand-500"} />
                                    : <X size={12} className="text-neutral-400" />}
                                </button>
                                {cell && isAvail && (
                                  isEditing ? (
                                    <div className="flex gap-1 items-center">
                                      <input autoFocus value={priceInput}
                                        onChange={e => setPriceInput(e.target.value)}
                                        onKeyDown={e => {
                                          if (e.key === "Enter") { e.preventDefault(); savePrice(item.id, city.id); }
                                          if (e.key === "Escape") setEditing(null);
                                        }}
                                        onBlur={e => {
                                          if (!e.relatedTarget) setTimeout(() => setEditing(null), 150);
                                        }}
                                        placeholder="0"
                                        className="w-16 text-xs border rounded px-1.5 py-0.5 text-center focus:border-brand-500 outline-none" />
                                      <button onMouseDown={e => e.preventDefault()} onClick={() => savePrice(item.id, city.id)} className="text-success-500 hover:text-success-600"><Check size={12} /></button>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => { setEditing({ itemId: item.id, cityId: city.id }); setPriceInput(hasPrice ? String(cell.price) : ""); }}
                                      className="text-xs text-neutral-400 hover:text-brand-500 flex items-center gap-0.5">
                                      {hasPrice
                                        ? <span className="text-success-600 font-medium num">{cell.price} ₽</span>
                                        : <span>+ цена</span>}
                                      <Edit3 size={9} />
                                    </button>
                                  )
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
