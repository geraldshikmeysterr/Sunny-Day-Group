"use client";
import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Plus, X, Loader2, Search, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { CustomSelect } from "@/components/CustomSelect";

const EMPTY = { code:"", description:"", promo_type:"percent", discount_value:"", promo_scope:"order", min_order_amount:"", max_uses:"", valid_from:"", valid_until:"", city_id:"", is_active:true, item_ids:[] as string[], category_ids:[] as string[] };
const TYPE_LABELS: Record<string,string> = { percent:"Скидка %", fixed:"Скидка ₽", set_price:"Фикс. цена" };
const SCOPE_LABELS: Record<string,string> = { order:"На заказ", item:"На блюда", category:"На категорию" };

export default function PromosPage() {
  const supabase = createClient();
  const [promos, setPromos] = useState<any[]>([]);
  const [cities, setCities] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<any|null>(null);
  const [form, setForm] = useState<any>({...EMPTY});
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    Promise.all([
      supabase.from("cities").select("id,name").eq("is_active",true),
      supabase.from("categories").select("id,name"),
      supabase.from("menu_items").select("id,name").eq("is_global_active",true).order("name"),
    ]).then(([{data:c},{data:cats},{data:mi}])=>{ setCities(c??[]); setCategories(cats??[]); setMenuItems(mi??[]); });
  }, []);

  const fetchPromos = useCallback(async () => {
    setLoading(true);
    let q = supabase.from("promocodes").select("*").order("created_at",{ascending:false});
    if (statusFilter==="active") q = q.eq("is_active",true);
    if (statusFilter==="inactive") q = q.eq("is_active",false);
    const { data } = await q;
    setPromos(data??[]); setLoading(false);
  }, [statusFilter]);

  useEffect(()=>{ fetchPromos(); },[fetchPromos]);

  function openAdd() { setEditing(null); setForm({...EMPTY}); setModal(true); }
  function openEdit(p:any) {
    setEditing(p);
    setForm({code:p.code,description:p.description??"",promo_type:p.promo_type,discount_value:String(p.discount_value),promo_scope:p.promo_scope,min_order_amount:p.min_order_amount?String(p.min_order_amount):"",max_uses:p.max_uses?String(p.max_uses):"",valid_from:p.valid_from?p.valid_from.slice(0,16):"",valid_until:p.valid_until?p.valid_until.slice(0,16):"",city_id:p.city_id??"",is_active:p.is_active,item_ids:[],category_ids:[]});
    setModal(true);
  }

  async function save() {
    const code = form.code.toUpperCase().trim();
    if (!code) return;
    if (!/^[A-Z0-9_-]{1,50}$/.test(code)) { toast.error("Код: только буквы, цифры, _ и -, максимум 50 символов"); return; }
    const discountValue = parseFloat(form.discount_value);
    if (isNaN(discountValue) || discountValue <= 0) { toast.error("Укажите размер скидки больше 0"); return; }
    if (form.promo_type === "percent" && discountValue > 100) { toast.error("Скидка в % не может превышать 100"); return; }
    setSaving(true);
    const payload = {code,description:form.description||null,promo_type:form.promo_type,discount_value:discountValue,promo_scope:form.promo_scope,min_order_amount:form.min_order_amount?parseFloat(form.min_order_amount):null,max_uses:form.max_uses?parseInt(form.max_uses):null,valid_from:form.valid_from||null,valid_until:form.valid_until||null,city_id:form.city_id||null,is_active:form.is_active};
    if (editing) await supabase.from("promocodes").update(payload).eq("id",editing.id);
    else await supabase.from("promocodes").insert(payload);
    toast.success(editing?"Промокод обновлён":"Промокод создан");
    setModal(false); await fetchPromos(); setSaving(false);
  }

  async function togglePromo(id:string, current:boolean) {
    await supabase.from("promocodes").update({is_active:!current}).eq("id",id);
    setPromos(p=>p.map(pr=>pr.id===id?{...pr,is_active:!current}:pr));
  }

  const filtered = promos.filter(p=>!search||p.code.toLowerCase().includes(search.toLowerCase())||(p.description??"").toLowerCase().includes(search.toLowerCase()));
  const statusOptions = [{value:"all",label:"Все статусы"},{value:"active",label:"Активные"},{value:"inactive",label:"Неактивные"}];
  const typeOptions = [{value:"percent",label:"Скидка в %"},{value:"fixed",label:"Скидка в ₽"},{value:"set_price",label:"Фиксированная цена"}];
  const scopeOptions = [{value:"order",label:"На весь заказ"},{value:"item",label:"На конкретные блюда"},{value:"category",label:"На категорию"}];
  const cityOptions = [{value:"",label:"Все города"},...cities.map(c=>({value:c.id,label:c.name}))];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold text-neutral-900">Промокоды</h1></div>
        <button onClick={openAdd} className="btn-primary btn-md"><Plus size={16}/> Создать</button>
      </div>
      <div className="card p-4 flex flex-wrap gap-3 items-center sticky top-4 z-20 bg-white shadow-card">
        <div className="relative flex-1 min-w-52"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Поиск по коду или описанию..." className="input pl-8 text-sm" autoComplete="off"/></div>
        <CustomSelect value={statusFilter} onChange={setStatusFilter} options={statusOptions} className="w-44"/>
      </div>
      <div className="card overflow-hidden">
        <table className="table">
          <thead><tr><th>Код</th><th>Тип</th><th>Размер</th><th>Область</th><th>Использований</th><th>Срок</th><th>Статус</th><th></th></tr></thead>
          <tbody>
            {loading&&Array.from({length:4}).map((_,i)=><tr key={i}>{Array.from({length:8}).map((_,j)=><td key={j}><div className="skeleton h-4"/></td>)}</tr>)}
            {!loading&&filtered.map(p=>(
              <tr key={p.id} className="cursor-pointer" onClick={()=>openEdit(p)}>
                <td><p className="font-mono font-bold">{p.code}</p>{p.description&&<p className="text-xs text-neutral-400 truncate max-w-[160px]">{p.description}</p>}</td>
                <td><span className="badge bg-sun-100 text-brand-700 text-xs">{TYPE_LABELS[p.promo_type]}</span></td>
                <td className="font-semibold num">{p.promo_type==="percent"?`${p.discount_value}%`:`${p.discount_value} ₽`}</td>
                <td className="text-sm text-neutral-500">{SCOPE_LABELS[p.promo_scope]}</td>
                <td className="num text-sm">{p.uses_count}{p.max_uses?` / ${p.max_uses}`:""}</td>
                <td className="text-xs text-neutral-400 whitespace-nowrap num">{p.valid_until?new Date(p.valid_until).toLocaleDateString("ru-RU"):"∞"}</td>
                <td><span className={cn("badge text-xs",p.is_active?"bg-success-50 text-success-700":"bg-neutral-100 text-neutral-500")}>{p.is_active?"Активен":"Откл."}</span></td>
                <td onClick={e=>e.stopPropagation()}><button onClick={()=>togglePromo(p.id,p.is_active)} className="btn-ghost btn-sm text-xs text-neutral-500">{p.is_active?"Откл.":"Вкл."}</button></td>
              </tr>
            ))}
            {!loading&&!filtered.length&&<tr><td colSpan={8} className="py-16 text-center text-neutral-400">Нет промокодов</td></tr>}
          </tbody>
        </table>
      </div>

      {modal&&(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-card-lg w-full max-w-lg max-h-[90vh] flex flex-col animate-scale-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
              <h2 className="text-xl font-semibold">{editing?`Промокод ${editing.code}`:"Новый промокод"}</h2>
              <button onClick={()=>setModal(false)} className="btn-ghost btn-sm"><X size={16}/></button>
            </div>
            <div className="overflow-y-auto flex-1 p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Код *</label><input value={form.code} onChange={e=>setForm((p:any)=>({...p,code:e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g,"")}))} className="input font-mono" placeholder="SUNNY20" maxLength={50} autoComplete="off"/></div>
                <div><label className="label">Город</label><CustomSelect value={form.city_id} onChange={v=>setForm((p:any)=>({...p,city_id:v}))} options={cityOptions}/></div>
              </div>
              <div><label className="label">Описание</label><textarea value={form.description} onChange={e=>setForm((p:any)=>({...p,description:e.target.value}))} rows={3} className="textarea w-full" placeholder="Описание промокода"/></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Тип скидки *</label><CustomSelect value={form.promo_type} onChange={v=>setForm((p:any)=>({...p,promo_type:v}))} options={typeOptions}/></div>
                <div><label className="label">{form.promo_type==="percent"?"Размер (%)":"Сумма (₽)"} *</label><input type="number" value={form.discount_value} onChange={e=>setForm((p:any)=>({...p,discount_value:e.target.value}))} className="input" placeholder="0" autoComplete="off"/></div>
              </div>
              <div><label className="label">Область применения</label><CustomSelect value={form.promo_scope} onChange={v=>setForm((p:any)=>({...p,promo_scope:v}))} options={scopeOptions}/></div>
              {form.promo_scope==="item"&&(
                <div><label className="label">Блюда</label>
                  <div className="border border-neutral-200 rounded-lg p-2 max-h-40 overflow-y-auto space-y-0.5">
                    {menuItems.map((item:any)=>(
                      <button key={item.id} type="button"
                        onClick={()=>setForm((p:any)=>({...p,item_ids:p.item_ids.includes(item.id)?p.item_ids.filter((id:string)=>id!==item.id):[...p.item_ids,item.id]}))}
                        className="flex items-center gap-2.5 w-full px-2 py-1.5 text-sm text-left hover:bg-neutral-50 rounded transition-colors">
                        <div className={cn("w-4 h-4 rounded border flex items-center justify-center shrink-0",form.item_ids.includes(item.id)?"bg-brand-500 border-brand-500":"border-neutral-300")}>
                          {form.item_ids.includes(item.id)&&<Check size={10} className="text-white"/>}
                        </div>
                        <span className="truncate">{item.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {form.promo_scope==="category"&&(
                <div><label className="label">Категории</label>
                  <div className="border border-neutral-200 rounded-lg p-2 max-h-40 overflow-y-auto space-y-0.5">
                    {categories.map((cat:any)=>(
                      <button key={cat.id} type="button"
                        onClick={()=>setForm((p:any)=>({...p,category_ids:p.category_ids.includes(cat.id)?p.category_ids.filter((id:string)=>id!==cat.id):[...p.category_ids,cat.id]}))}
                        className="flex items-center gap-2.5 w-full px-2 py-1.5 text-sm text-left hover:bg-neutral-50 rounded transition-colors">
                        <div className={cn("w-4 h-4 rounded border flex items-center justify-center shrink-0",form.category_ids.includes(cat.id)?"bg-brand-500 border-brand-500":"border-neutral-300")}>
                          {form.category_ids.includes(cat.id)&&<Check size={10} className="text-white"/>}
                        </div>
                        <span className="truncate">{cat.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Мин. сумма (₽)</label><input type="number" value={form.min_order_amount} onChange={e=>setForm((p:any)=>({...p,min_order_amount:e.target.value}))} className="input" placeholder="0" autoComplete="off"/></div>
                <div><label className="label">Макс. использований</label><input type="number" value={form.max_uses} onChange={e=>setForm((p:any)=>({...p,max_uses:e.target.value}))} className="input" placeholder="∞" autoComplete="off"/></div>
                <div><label className="label">Действует с</label><input type="datetime-local" value={form.valid_from} onChange={e=>setForm((p:any)=>({...p,valid_from:e.target.value}))} className="input"/></div>
                <div><label className="label">Действует до</label><input type="datetime-local" value={form.valid_until} onChange={e=>setForm((p:any)=>({...p,valid_until:e.target.value}))} className="input"/></div>
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={form.is_active} onChange={e=>setForm((p:any)=>({...p,is_active:e.target.checked}))} className="w-4 h-4 rounded accent-brand-500"/> Активен</label>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-neutral-200">
              <button onClick={()=>setModal(false)} className="btn-secondary btn-md">Отмена</button>
              <button onClick={save} disabled={saving||!form.code} className="btn-primary btn-md">{saving&&<Loader2 size={14} className="animate-spin"/>} Сохранить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
