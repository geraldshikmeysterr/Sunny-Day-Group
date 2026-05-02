"use client";
import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Plus, Trash2, X, Loader2, Eye, EyeOff, Edit2, Phone, Mail, MessageCircle, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import ZonesPanel, { type FullZone } from "@/components/ZonesPanel";

type MenuType = { id: string; slug: string; name: string; is_global?: boolean };

type CityMenuType = { menu_type_id: string; is_available: boolean };

type City = {
  id: string; name: string; is_active: boolean;
  phone: string | null; email: string | null;
  telegram: string | null; instagram: string | null; vk: string | null; max_messenger: string | null;
  city_menu_types: CityMenuType[];
};

type CityFields = {
  name: string; phone: string; email: string;
  telegram: string; instagram: string; vk: string; max: string;
  is_active: boolean;
  menuTypeAvailability: Record<string, boolean>;
};

const EMPTY: CityFields = {
  name: "", phone: "", email: "", telegram: "", instagram: "", vk: "", max: "",
  is_active: false,
  menuTypeAvailability: {},
};

// ---------------------------------------------------------------------------
// Phone formatter: +7 (XXX) XXX-XX-XX
// prev is needed to detect deletion of auto-inserted separators (e.g. ")").
// ---------------------------------------------------------------------------
function formatPhone(raw: string, prev: string): string {
  const allDigits = raw.replace(/\D/g, "");
  if (!allDigits) return "";

  if (allDigits === "7" && !prev) return "+7";

  let body = (allDigits.startsWith("7") || allDigits.startsWith("8"))
    ? allDigits.slice(1)
    : allDigits;

  const prevDigits = prev.replace(/\D/g, "");
  const prevBody = (prevDigits.startsWith("7") || prevDigits.startsWith("8"))
    ? prevDigits.slice(1)
    : prevDigits;
  if (body.length === prevBody.length && raw.length < prev.length) {
    body = body.slice(0, -1);
  }

  body = body.slice(0, 10);
  if (!body) return "+7";

  let r = `+7 (${body.slice(0, Math.min(3, body.length))}`;
  if (body.length >= 3) r += ")";
  if (body.length > 3) r += ` ${body.slice(3, 6)}`;
  if (body.length > 6) r += `-${body.slice(6, 8)}`;
  if (body.length > 8) r += `-${body.slice(8, 10)}`;
  return r;
}

// ---------------------------------------------------------------------------
// CityFormFields — MUST be defined outside CitiesPage to avoid remount on re-render
// ---------------------------------------------------------------------------
function CityFormFields({ values, onChange, menuTypes }: {
  values: CityFields;
  onChange: (field: keyof CityFields, value: string | boolean | Record<string, boolean>) => void;
  menuTypes: MenuType[];
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div>
          <label className="label">Название города *</label>
          <input value={values.name}
            onChange={e => onChange("name", e.target.value)}
            className="input" placeholder="Новосибирск" />
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={values.is_active}
            onChange={e => onChange("is_active", e.target.checked)}
            className="w-4 h-4 rounded accent-brand-500" />
          <span className="text-neutral-700">Активен</span>
        </label>
      </div>

      <div className="border-t border-neutral-200 pt-4">
        <p className="text-sm font-semibold text-neutral-700 mb-3">Контакты города</p>
        <div className="space-y-2">
          <div>
            <label className="label">Номер телефона</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"><Phone size={13} /></span>
              <input type="tel" value={values.phone}
                onChange={e => onChange("phone", formatPhone(e.target.value, values.phone as string))}
                className="input pl-8 text-sm" placeholder="+7 (999) 000-00-00" />
            </div>
          </div>
          <div>
            <label className="label">Электронная почта</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"><Mail size={13} /></span>
              <input type="email" value={values.email}
                onChange={e => onChange("email", e.target.value)}
                className="input pl-8 text-sm" placeholder="city@operator.ru" />
            </div>
          </div>
          <div>
            <label className="label">Telegram</label>
            <input value={values.telegram}
              onChange={e => onChange("telegram", e.target.value)}
              className="input text-sm" placeholder="@solnechniy_den" />
          </div>
          <div>
            <label className="label">Instagram</label>
            <input value={values.instagram}
              onChange={e => onChange("instagram", e.target.value)}
              className="input text-sm" placeholder="@solnechniy_den" />
          </div>
          <div>
            <label className="label">ВКонтакте</label>
            <input value={values.vk}
              onChange={e => onChange("vk", e.target.value)}
              className="input text-sm" placeholder="https://vk.com/…" />
          </div>
          <div>
            <label className="label">Max</label>
            <input value={values.max}
              onChange={e => onChange("max", e.target.value)}
              className="input text-sm" placeholder="@solnechniy_den" />
          </div>
        </div>
      </div>

      {menuTypes.length > 0 && (
        <div className="border-t border-neutral-200 pt-4">
          <p className="text-sm font-semibold text-neutral-700 mb-3">Типы меню</p>
          <div className="space-y-2">
            {menuTypes.map(mt => (
              mt.is_global ? (
                <div key={mt.id} className="flex items-center gap-2.5 text-sm">
                  <input type="checkbox" checked disabled className="w-4 h-4 rounded accent-brand-500 opacity-50 cursor-not-allowed" />
                  <span className="text-neutral-400">{mt.name}</span>
                  <span className="text-xs text-cyan-600 bg-cyan-50 px-1.5 py-0.5 rounded">Глобально</span>
                </div>
              ) : (
                <label key={mt.id} className="flex items-center gap-2.5 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={values.menuTypeAvailability[mt.id] ?? true}
                    onChange={e => onChange("menuTypeAvailability", {
                      ...values.menuTypeAvailability,
                      [mt.id]: e.target.checked,
                    })}
                    className="w-4 h-4 rounded accent-brand-500"
                  />
                  <span className="text-neutral-700">{mt.name}</span>
                </label>
              )
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CitiesPage
// ---------------------------------------------------------------------------
export default function CitiesPage() {
  const supabase = createClient();
  const [cities,       setCities]       = useState<City[]>([]);
  const [menuTypes,    setMenuTypes]    = useState<MenuType[]>([]);
  const [search,       setSearch]       = useState("");
  const [loading,      setLoading]      = useState(true);
  const [addModal,     setAddModal]     = useState(false);
  const [editModal,    setEditModal]    = useState<City | null>(null);
  const [addForm,      setAddForm]      = useState<CityFields>(EMPTY);
  const [editForm,     setEditForm]     = useState<CityFields>(EMPTY);
  const [saving,       setSaving]       = useState(false);
  const [deleting,     setDeleting]     = useState<string | null>(null);
  const [error,        setError]        = useState("");
  const [pendingZones, setPendingZones] = useState<FullZone[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data: c } = await supabase
      .from("cities")
      .select("*, city_menu_types(menu_type_id, is_available)")
      .order("name");
    setCities((c as City[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    supabase.from("menu_types").select("id, slug, name, is_global").then(({ data }) => {
      setMenuTypes(data ?? []);
    });
  }, []);

  function patchAdd(field: keyof CityFields, value: string | boolean | Record<string, boolean>) {
    setAddForm(p => ({ ...p, [field]: value }));
  }
  function patchEdit(field: keyof CityFields, value: string | boolean | Record<string, boolean>) {
    setEditForm(p => ({ ...p, [field]: value }));
  }

  function openAddModal() {
    const availability = Object.fromEntries(menuTypes.map(mt => [mt.id, true]));
    setAddForm({ ...EMPTY, menuTypeAvailability: availability });
    setAddModal(true);
    setError("");
    setPendingZones([]);
  }

  async function createCity() {
    if (!addForm.name) { setError("Введите название города"); return; }
    setSaving(true); setError("");
    try {
      const { data: newCity, error: cityError } = await supabase
        .from("cities").insert({ name: addForm.name, is_active: addForm.is_active })
        .select().single();
      if (cityError) throw new Error(cityError.message);

      const socials: any = {};
      if (addForm.phone)     socials.phone         = addForm.phone;
      if (addForm.email)     socials.email         = addForm.email;
      if (addForm.telegram)  socials.telegram      = addForm.telegram;
      if (addForm.instagram) socials.instagram     = addForm.instagram;
      if (addForm.vk)        socials.vk            = addForm.vk;
      if (addForm.max)       socials.max_messenger = addForm.max;
      if (Object.keys(socials).length > 0) {
        await supabase.from("cities").update(socials).eq("id", newCity.id);
      }

      // Seed city_menu_types
      const menuTypeRows = Object.entries(addForm.menuTypeAvailability).map(([menu_type_id, is_available]) => ({
        city_id: newCity.id, menu_type_id, is_available,
      }));
      if (menuTypeRows.length > 0) {
        await supabase.from("city_menu_types").upsert(menuTypeRows, { onConflict: "city_id,menu_type_id" });
      }

      try {
        const { data: menuItems } = await supabase
          .from("menu_items")
          .select("id, categories(menu_types(is_global))")
          .eq("is_global_active", true);
        const cityItems = (menuItems ?? []).filter((i: any) => !i.categories?.menu_types?.is_global);
        if (cityItems.length) {
          await supabase.from("city_menu_items").upsert(
            cityItems.map(i => ({ city_id: newCity.id, menu_item_id: i.id, price: 0, is_available: true })),
            { onConflict: "city_id,menu_item_id" }
          );
        }
      } catch { /* non-critical */ }

      if (pendingZones.length > 0) {
        await supabase.from("delivery_zones").insert(
          pendingZones.map((z, i) => ({
            city_id: newCity.id, name: z.name, delivery_fee: z.delivery_fee,
            min_order: z.min_order, free_from: z.free_from, geojson: z.geojson,
            is_active: z.is_active, sort_order: i,
          }))
        );
      }

      toast.success(`Город «${newCity.name}» создан`);
      setAddModal(false); setAddForm(EMPTY); setPendingZones([]); await fetchData();
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  }

  async function saveCity() {
    if (!editModal) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("cities").update({
        name: editForm.name, is_active: editForm.is_active,
        phone: editForm.phone || null, email: editForm.email || null,
        telegram: editForm.telegram || null, instagram: editForm.instagram || null,
        vk: editForm.vk || null, max_messenger: editForm.max || null,
      }).eq("id", editModal.id);
      if (error) { toast.error(error.message); setSaving(false); return; }

      const menuTypeRows = Object.entries(editForm.menuTypeAvailability).map(([menu_type_id, is_available]) => ({
        city_id: editModal.id, menu_type_id, is_available,
      }));
      if (menuTypeRows.length > 0) {
        await supabase.from("city_menu_types").upsert(menuTypeRows, { onConflict: "city_id,menu_type_id" });
      }

      toast.success("Город сохранён");
      setEditModal(null); setEditForm(EMPTY); await fetchData();
    } catch (e: any) { toast.error(e.message); }
    setSaving(false);
  }

  async function deleteCity(city: City) {
    if (!confirm(`Удалить город «${city.name}»?`)) return;
    setDeleting(city.id);
    try {
      const { count } = await supabase
        .from("orders").select("id", { count: "exact", head: true }).eq("city_id", city.id);
      if (count && count > 0) {
        if (!confirm(`В городе «${city.name}» есть ${count} заказов.\nУдалить все заказы и сам город?`)) { setDeleting(null); return; }
        const { error: ordErr } = await supabase.from("orders").delete().eq("city_id", city.id);
        if (ordErr) { toast.error(ordErr.message); setDeleting(null); return; }
      }
      const { error } = await supabase.from("cities").delete().eq("id", city.id);
      if (error) { toast.error(error.message); setDeleting(null); return; }
      setCities(p => p.filter(c => c.id !== city.id));
      toast.success("Город удалён");
    } catch (e: any) { toast.error(e.message); }
    setDeleting(null);
  }

  async function toggleCity(id: string, current: boolean) {
    await supabase.from("cities").update({ is_active: !current }).eq("id", id);
    setCities(p => p.map(c => c.id === id ? { ...c, is_active: !current } : c));
  }

  function openEdit(city: City) {
    const availability: Record<string, boolean> = {};
    for (const cmt of city.city_menu_types ?? []) {
      availability[cmt.menu_type_id] = cmt.is_available;
    }
    // Default any missing types to true
    for (const mt of menuTypes) {
      if (!(mt.id in availability)) availability[mt.id] = true;
    }
    setEditForm({
      name: city.name, is_active: city.is_active,
      phone: city.phone ?? "", email: city.email ?? "",
      telegram: city.telegram ?? "", instagram: city.instagram ?? "",
      vk: city.vk ?? "", max: city.max_messenger ?? "",
      menuTypeAvailability: availability,
    });
    setEditModal(city); setError("");
  }

  function closeEditModal() {
    if (editModal) {
      const origAvailability = Object.fromEntries(
        (editModal.city_menu_types ?? []).map(cmt => [cmt.menu_type_id, cmt.is_available])
      );
      const changed =
        editForm.name !== editModal.name ||
        editForm.is_active !== editModal.is_active ||
        editForm.phone !== (editModal.phone ?? "") ||
        editForm.email !== (editModal.email ?? "") ||
        editForm.telegram !== (editModal.telegram ?? "") ||
        editForm.instagram !== (editModal.instagram ?? "") ||
        editForm.vk !== (editModal.vk ?? "") ||
        editForm.max !== (editModal.max_messenger ?? "") ||
        Object.entries(editForm.menuTypeAvailability).some(
          ([id, val]) => (origAvailability[id] ?? true) !== val
        );
      if (changed && !confirm("Есть несохранённые изменения. Закрыть без сохранения?")) return;
    }
    setEditModal(null);
    setEditForm(EMPTY);
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900">Города</h1>
          <p className="text-sm text-neutral-500 mt-0.5">{cities.length} городов</p>
        </div>
        <button onClick={openAddModal} className="btn-primary btn-md">
          <Plus size={16} /> Новый город
        </button>
      </div>

      <div className="card p-4 flex flex-wrap gap-3 items-center sticky top-4 z-20 bg-white shadow-card">
        <div className="relative flex-1 min-w-52">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск по городу..." className="input pl-8 text-sm" autoComplete="off" />
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 3 }, (_, i) => (
          <div key={`sk-${i}`} className="card p-4"><div className="skeleton h-5 w-32 mb-2" /><div className="skeleton h-4 w-48" /></div>
        ))}</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="table">
            <thead>
              <tr><th>Город</th><th>Контакты</th><th className="w-full">Типы меню</th><th>Статус</th><th></th></tr>
            </thead>
            <tbody>
              {cities.filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase())).map(city => {
                const hasContacts = city.phone || city.email || city.telegram || city.instagram || city.vk || city.max_messenger;
                return (
                  <tr key={city.id} className="group">
                    <td className="font-semibold text-neutral-900 whitespace-nowrap">{city.name}</td>
                    <td>
                      {hasContacts ? (
                        <div className="space-y-0.5 text-xs text-neutral-500">
                          {city.phone    && <div className="flex items-center gap-1"><Phone size={10} className="text-neutral-400"/>{city.phone}</div>}
                          {city.email    && <div className="flex items-center gap-1"><Mail size={10} className="text-neutral-400"/>{city.email}</div>}
                          {city.telegram && <div className="flex items-center gap-1"><MessageCircle size={10} className="text-neutral-400"/>{city.telegram}</div>}
                          {(city.instagram || city.vk || city.max_messenger) && (
                            <div className="text-neutral-400 text-xs">
                              {[city.instagram && "Instagram", city.vk && "ВК", city.max_messenger && "Max"].filter(Boolean).join(", ")}
                            </div>
                          )}
                        </div>
                      ) : <span className="text-neutral-300 text-xs">—</span>}
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {menuTypes.map(mt => {
                          const isAvail = city.city_menu_types?.find(cmt => cmt.menu_type_id === mt.id)?.is_available ?? true;
                          return (
                            <span key={mt.id} className={cn(
                              "badge text-xs",
                              !isAvail ? "bg-neutral-100 text-neutral-400 line-through" :
                              mt.slug === "frozen" ? "bg-cyan-50 text-cyan-700" : "bg-orange-50 text-orange-600"
                            )}>
                              {mt.slug === "frozen" ? "Заморозка" : "Готовые блюда"}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    <td className="whitespace-nowrap">
                      <span className={cn("badge text-xs", city.is_active ? "bg-success-50 text-success-700" : "bg-neutral-100 text-neutral-500")}>
                        {city.is_active ? "Активен" : "Скрыт"}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openEdit(city)} className="btn-ghost btn-sm text-brand-500"><Edit2 size={14}/></button>
                        <button onClick={() => toggleCity(city.id, city.is_active)} className={cn("btn-ghost btn-sm", city.is_active ? "text-success-600" : "text-neutral-400")}>
                          {city.is_active ? <Eye size={14}/> : <EyeOff size={14}/>}
                        </button>
                        <button onClick={() => deleteCity(city)} disabled={deleting === city.id} className="btn-ghost btn-sm text-danger-500">
                          {deleting === city.id ? <Loader2 size={14} className="animate-spin"/> : <Trash2 size={14}/>}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!cities.length && <tr><td colSpan={5} className="py-16 text-center text-neutral-400">Городов пока нет</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* Add modal */}
      {addModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-card-lg w-full max-w-[calc(88vh+520px)] h-[88vh] flex flex-col animate-scale-in overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 flex-shrink-0">
              <h2 className="text-xl font-semibold">Новый город</h2>
              <button onClick={() => setAddModal(false)} className="btn-ghost btn-sm"><X size={16}/></button>
            </div>
            <div className="flex flex-1 min-h-0">
              <div className="w-80 flex-shrink-0 border-r border-neutral-200 flex flex-col">
                <div className="overflow-y-auto flex-1 p-6">
                  <CityFormFields values={addForm} onChange={patchAdd} menuTypes={menuTypes} />
                </div>
                {error && <p className="text-sm text-danger-600 bg-danger-50 mx-6 mb-2 px-3 py-2 rounded-lg">{error}</p>}
                <div className="flex justify-end gap-2 px-6 py-4 border-t border-neutral-200 flex-shrink-0">
                  <button onClick={() => setAddModal(false)} className="btn-secondary btn-md">Отмена</button>
                  <button onClick={createCity} disabled={saving} className="btn-primary btn-md">
                    {saving && <Loader2 size={14} className="animate-spin"/>} Создать
                  </button>
                </div>
              </div>
              <div className="flex-1 flex flex-col min-h-0">
                <div className="px-4 py-3 border-b border-neutral-100 flex-shrink-0">
                  <p className="text-sm font-semibold text-neutral-700">Зоны доставки</p>
                  <p className="text-xs text-neutral-400">Зоны будут сохранены при создании города. Оператора можно назначить при редактировании зоны.</p>
                </div>
                <div className="flex-1 min-h-0">
                  <ZonesPanel pendingZones={pendingZones} onPendingChange={setPendingZones} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-card-lg w-full max-w-[calc(88vh+520px)] h-[88vh] flex flex-col animate-scale-in overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 flex-shrink-0">
              <h2 className="text-xl font-semibold">Редактировать город</h2>
              <button onClick={closeEditModal} className="btn-ghost btn-sm"><X size={16}/></button>
            </div>
            <div className="flex flex-1 min-h-0">
              <div className="w-80 flex-shrink-0 border-r border-neutral-200 flex flex-col">
                <div className="overflow-y-auto flex-1 p-6">
                  <CityFormFields values={editForm} onChange={patchEdit} menuTypes={menuTypes} />
                </div>
                <div className="flex justify-end gap-2 px-6 py-4 border-t border-neutral-200 flex-shrink-0">
                  <button onClick={closeEditModal} className="btn-secondary btn-md">Отмена</button>
                  <button onClick={saveCity} disabled={saving} className="btn-primary btn-md">
                    {saving && <Loader2 size={14} className="animate-spin"/>} Сохранить
                  </button>
                </div>
              </div>
              <div className="flex-1 flex flex-col min-h-0">
                <div className="px-4 py-3 border-b border-neutral-100 flex-shrink-0">
                  <p className="text-sm font-semibold text-neutral-700">Зоны доставки</p>
                  <p className="text-xs text-neutral-400">Оператор назначается при редактировании зоны</p>
                </div>
                <div className="flex-1 min-h-0">
                  <ZonesPanel cityId={editModal.id} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
