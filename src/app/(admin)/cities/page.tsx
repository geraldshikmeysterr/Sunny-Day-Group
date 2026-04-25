"use client";
import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Plus, Trash2, X, Loader2, Eye, EyeOff, Edit2, Phone, Mail, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import ZonesPanel, { type FullZone } from "@/components/ZonesPanel";

type City = {
  id: string; name: string; region: string | null; is_active: boolean;
  phone: string | null; email: string | null;
  telegram: string | null; instagram: string | null; vk: string | null; max_messenger: string | null;
};

const EMPTY_ADD  = { city_name: "", city_region: "", city_phone: "", city_email: "", city_telegram: "", city_instagram: "", city_vk: "", city_max: "" };
const EMPTY_EDIT = { name: "", region: "", phone: "", email: "", telegram: "", instagram: "", vk: "", max: "" };

export default function CitiesPage() {
  const supabase = createClient();
  const [cities,       setCities]       = useState<City[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [addModal,     setAddModal]     = useState(false);
  const [editModal,    setEditModal]    = useState<City | null>(null);
  const [addForm,      setAddForm]      = useState(EMPTY_ADD);
  const [editForm,     setEditForm]     = useState(EMPTY_EDIT);
  const [saving,       setSaving]       = useState(false);
  const [deleting,     setDeleting]     = useState<string | null>(null);
  const [error,        setError]        = useState("");
  const [pendingZones, setPendingZones] = useState<FullZone[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data: c } = await supabase.from("cities").select("*").order("name");
    setCities(c ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function createCity() {
    if (!addForm.city_name) { setError("Введите название города"); return; }
    setSaving(true); setError("");
    try {
      const { data: newCity, error: cityError } = await supabase
        .from("cities").insert({ name: addForm.city_name, region: addForm.city_region || null })
        .select().single();
      if (cityError) throw new Error(cityError.message);

      const socials: any = {};
      if (addForm.city_phone)     socials.phone         = addForm.city_phone;
      if (addForm.city_email)     socials.email         = addForm.city_email;
      if (addForm.city_telegram)  socials.telegram      = addForm.city_telegram;
      if (addForm.city_instagram) socials.instagram     = addForm.city_instagram;
      if (addForm.city_vk)        socials.vk            = addForm.city_vk;
      if (addForm.city_max)       socials.max_messenger = addForm.city_max;
      if (Object.keys(socials).length > 0) {
        await supabase.from("cities").update(socials).eq("id", newCity.id);
      }

      try {
        const { data: menuItems } = await supabase.from("menu_items").select("id").eq("is_global_active", true);
        if (menuItems?.length) {
          await supabase.from("city_menu_items").upsert(
            menuItems.map(i => ({ city_id: newCity.id, menu_item_id: i.id, price: 0, is_available: true })),
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
      setAddModal(false); setAddForm(EMPTY_ADD); setPendingZones([]); await fetchData();
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  }

  async function saveCity() {
    if (!editModal) return;
    setSaving(true);
    try {
      await supabase.from("cities").update({
        name: editForm.name, region: editForm.region || null,
        phone: editForm.phone || null, email: editForm.email || null,
        telegram: editForm.telegram || null, instagram: editForm.instagram || null,
        vk: editForm.vk || null, max_messenger: editForm.max || null,
      }).eq("id", editModal.id);
      toast.success("Город сохранён");
      setEditModal(null); setEditForm(EMPTY_EDIT); await fetchData();
    } catch (e: any) { toast.error(e.message); }
    setSaving(false);
  }

  async function deleteCity(city: City) {
    if (!confirm(`Удалить город «${city.name}»?`)) return;
    setDeleting(city.id);
    try {
      await supabase.from("delivery_zones").delete().eq("city_id", city.id);
      await supabase.from("cities").delete().eq("id", city.id);
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
    setEditForm({ name: city.name, region: city.region ?? "", phone: city.phone ?? "", email: city.email ?? "", telegram: city.telegram ?? "", instagram: city.instagram ?? "", vk: city.vk ?? "", max: city.max_messenger ?? "" });
    setEditModal(city); setError("");
  }

  // ------------------------------------------------------------------
  // Shared form section component
  // ------------------------------------------------------------------

  function CityFormFields({ prefix, form, setForm }: {
    prefix: "add" | "edit";
    form: typeof addForm | typeof editForm;
    setForm: (v: any) => void;
  }) {
    const f = form as any;
    const isAdd = prefix === "add";
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="label">Название города *</label>
            <input value={isAdd ? f.city_name : f.name}
              onChange={e => setForm((p: any) => ({ ...p, [isAdd ? "city_name" : "name"]: e.target.value }))}
              className="input" placeholder="Новосибирск" />
          </div>
          <div className="col-span-2">
            <label className="label">Регион</label>
            <input value={isAdd ? f.city_region : f.region}
              onChange={e => setForm((p: any) => ({ ...p, [isAdd ? "city_region" : "region"]: e.target.value }))}
              className="input" placeholder="Необязательно" />
          </div>
        </div>

        <div className="border-t border-neutral-200 pt-4">
          <p className="text-sm font-semibold text-neutral-700 mb-3">Контакты города</p>
          <div className="space-y-2">
            {([
              { key: isAdd ? "city_phone" : "phone",         icon: <Phone size={13} />,  ph: "+7 (999) 000-00-00",  label: "Номер телефона" },
              { key: isAdd ? "city_email" : "email",         icon: <Mail size={13} />,   ph: "city@operator.ru",    label: "Электронная почта", type: "email" },
              { key: isAdd ? "city_telegram" : "telegram",   icon: null,                 ph: "@solnechniy_den",     label: "Telegram" },
              { key: isAdd ? "city_instagram" : "instagram", icon: null,                 ph: "@solnechniy_den",     label: "Instagram" },
              { key: isAdd ? "city_vk" : "vk",               icon: null,                 ph: "https://vk.com/…",    label: "ВКонтакте" },
              { key: isAdd ? "city_max" : "max",             icon: null,                 ph: "@solnechniy_den",     label: "Max" },
            ] as any[]).map(({ key, icon, ph, type, label }) => (
              <div key={key}>
                <label className="label">{label}</label>
                {icon ? (
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">{icon}</span>
                    <input type={type ?? "text"} value={f[key] ?? ""} onChange={e => setForm((p: any) => ({ ...p, [key]: e.target.value }))}
                      className="input pl-8 text-sm" placeholder={ph} />
                  </div>
                ) : (
                  <input type={type ?? "text"} value={f[key] ?? ""} onChange={e => setForm((p: any) => ({ ...p, [key]: e.target.value }))}
                    className="input text-sm" placeholder={ph} />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
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
        <button onClick={() => { setAddModal(true); setError(""); setAddForm(EMPTY_ADD); setPendingZones([]); }} className="btn-primary btn-md">
          <Plus size={16} /> Новый город
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 3 }, (_, i) => (
          <div key={`sk-${i}`} className="card p-4"><div className="skeleton h-5 w-32 mb-2" /><div className="skeleton h-4 w-48" /></div>
        ))}</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="table">
            <thead>
              <tr><th>Город</th><th>Регион</th><th>Контакты</th><th>Статус</th><th></th></tr>
            </thead>
            <tbody>
              {cities.map(city => {
                const hasContacts = city.phone || city.email || city.telegram || city.instagram || city.vk || city.max_messenger;
                return (
                  <tr key={city.id}>
                    <td className="font-semibold text-neutral-900">{city.name}</td>
                    <td className="text-neutral-500 text-sm">{city.region ?? "—"}</td>
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
                      <span className={cn("badge text-xs", city.is_active ? "bg-success-50 text-success-700" : "bg-neutral-100 text-neutral-500")}>
                        {city.is_active ? "Активен" : "Скрыт"}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-0.5">
                        <button onClick={() => openEdit(city)} className="btn-ghost btn-sm text-brand-500"><Edit2 size={14}/></button>
                        <button onClick={() => toggleCity(city.id, city.is_active)} className="btn-ghost btn-sm text-neutral-400">
                          {city.is_active ? <EyeOff size={14}/> : <Eye size={14}/>}
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

      {/* ------------------------------------------------------------------ */}
      {/* Add modal                                                           */}
      {/* ------------------------------------------------------------------ */}
      {addModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-card-lg w-full max-w-[1280px] h-[88vh] flex flex-col animate-scale-in overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 flex-shrink-0">
              <h2 className="text-xl font-semibold">Новый город</h2>
              <button onClick={() => setAddModal(false)} className="btn-ghost btn-sm"><X size={16}/></button>
            </div>

            <div className="flex flex-1 min-h-0">
              <div className="w-80 flex-shrink-0 border-r border-neutral-200 flex flex-col">
                <div className="overflow-y-auto flex-1 p-6">
                  <CityFormFields prefix="add" form={addForm} setForm={setAddForm} />
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

      {/* ------------------------------------------------------------------ */}
      {/* Edit modal                                                          */}
      {/* ------------------------------------------------------------------ */}
      {editModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-card-lg w-full max-w-[1280px] h-[88vh] flex flex-col animate-scale-in overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 flex-shrink-0">
              <h2 className="text-xl font-semibold">Редактировать город</h2>
              <button onClick={() => setEditModal(null)} className="btn-ghost btn-sm"><X size={16}/></button>
            </div>

            <div className="flex flex-1 min-h-0">
              <div className="w-80 flex-shrink-0 border-r border-neutral-200 flex flex-col">
                <div className="overflow-y-auto flex-1 p-6">
                  <CityFormFields prefix="edit" form={editForm} setForm={setEditForm} />
                </div>
                <div className="flex justify-end gap-2 px-6 py-4 border-t border-neutral-200 flex-shrink-0">
                  <button onClick={() => setEditModal(null)} className="btn-secondary btn-md">Отмена</button>
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
