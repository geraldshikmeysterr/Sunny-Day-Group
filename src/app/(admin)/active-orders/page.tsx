"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime, ORDER_STATUS_LABELS, ORDER_STATUS_COLORS, ALLOWED_TRANSITIONS } from "@/lib/utils";
import { useAdmin } from "@/components/layout/AdminContext";
import { Snowflake } from "lucide-react";
import { RefreshCw, Search, Loader2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { CustomSelect } from "@/components/CustomSelect";
import type { OrderStatus } from "@/lib/utils";

const PAGE_SIZE = 25;
const ACTIVE: OrderStatus[] = ["new", "confirmed", "preparing", "delivering"];

export default function ActiveOrdersPage() {
  const { isAdmin, zoneIds, handlesFrozen } = useAdmin() as any;
  const supabase = createClient();
  const [orders, setOrders] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [cityFilter, setCityFilter] = useState("all");
  const [cities, setCities] = useState<any[]>([]);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    if (isAdmin) createClient().from("cities").select("id,name").order("name").then(({ data }) => setCities(data ?? []));
  }, [isAdmin]);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase.from("orders")
        .select("id,status,menu_type,total_amount,delivery_fee,comment,created_at,payment_status,profiles(phone,first_name),addresses(full_address,street,house,apartment),order_items(item_name,quantity,item_price),cities(name)", { count: "exact" })
        .in("status", ACTIVE)
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
        .order("created_at", { ascending: false });
      if (!isAdmin) {
        if (handlesFrozen && zoneIds.length > 0) {
          q = q.or(`delivery_zone_id.in.(${zoneIds.join(",")}),menu_type.eq.frozen`);
        } else if (handlesFrozen) {
          q = q.eq("menu_type", "frozen");
        } else if (zoneIds.length > 0) {
          q = q.in("delivery_zone_id", zoneIds);
        }
      } else if (cityFilter !== "all") {
        q = q.eq("city_id", cityFilter);
      }
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      if (search.trim()) {
        const safe = search.trim().replaceAll(/[%_\\]/g, String.raw`\$&`);
        q = q.or(`id.ilike.${safe}%,profiles.phone.ilike.%${safe}%`);
      }
      const { data, count } = await q;
      setOrders(data ?? []); setTotal(count ?? 0);
    } catch { toast.error("Ошибка загрузки"); }
    finally { setLoading(false); }
  }, [page, statusFilter, cityFilter, isAdmin, zoneIds, handlesFrozen, search]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);
  useEffect(() => { setPage(0); }, [statusFilter, cityFilter, search]);

  const fetchOrdersRef = useRef(fetchOrders);
  useEffect(() => { fetchOrdersRef.current = fetchOrders; }, [fetchOrders]);

  useEffect(() => {
    const ch = supabase.channel("orders-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => fetchOrdersRef.current())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  async function advance(orderId: string, next: OrderStatus) {
    setUpdating(orderId);
    try {
      const { error } = await supabase.from("orders").update({ status: next }).eq("id", orderId);
      if (error) throw error;
      toast.success(`→ ${ORDER_STATUS_LABELS[next]}`);
      fetchOrders();
    } catch {
      toast.error("Не удалось обновить статус заказа");
    }
    setUpdating(null);
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const cityOptions = [{ value: "all", label: "Все города" }, ...cities.map(c => ({ value: c.id, label: c.name }))];
  const statusOptions = [{ value: "all", label: "Все статусы" }, ...ACTIVE.map(s => ({ value: s, label: ORDER_STATUS_LABELS[s] }))];

  return (
    <div className="p-6 max-w-full mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold text-neutral-900">Актуальные заказы</h1><p className="text-sm text-neutral-500 mt-0.5">{total} заказов в работе</p></div>
        <button onClick={fetchOrders} disabled={loading} className="btn-secondary btn-sm"><RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Обновить</button>
      </div>
      <div className="card p-4 flex flex-wrap gap-3 items-center sticky top-4 z-20 bg-white shadow-card">
        <div className="relative flex-1 min-w-52">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск..." className="input pl-8 text-sm" autoComplete="off" />
        </div>
        {isAdmin && <CustomSelect value={cityFilter} onChange={setCityFilter} options={cityOptions} className="w-44" />}
        <CustomSelect value={statusFilter} onChange={setStatusFilter} options={statusOptions} className="w-44" />
      </div>
      <div className="card overflow-hidden">
        <div className="table-wrapper rounded-none border-0">
          <table className="table">
            <thead><tr><th>Заказ</th><th>Клиент</th>{isAdmin && <th>Город</th>}<th>Тип</th><th>Адрес</th><th>Состав</th><th>Комментарий</th><th>Сумма</th><th>Статус</th><th>Дата</th><th></th></tr></thead>
            <tbody>
              {loading && Array.from({length:5},(_,i)=>i).map(i=><tr key={`sk-${i}`}>{Array.from({length:isAdmin?11:10},(_,j)=>j).map(j=><td key={`sk-col-${j}`}><div className="skeleton h-4 w-full"/></td>)}</tr>)}
              {!loading && orders.map(order => {
                const c = ORDER_STATUS_COLORS[order.status as OrderStatus];
                const nextStatus = ALLOWED_TRANSITIONS[order.status as OrderStatus].find(s => s !== "cancelled");
                const addr = order.addresses?.full_address ?? `${order.addresses?.street??""} ${order.addresses?.house??""}`.trim();
                const items = order.order_items?.map((i:any)=>`${i.item_name} ×${i.quantity}`).join(", ");
                return (
                  <tr key={order.id}>
                    <td className="w-px whitespace-nowrap font-mono text-xs font-bold text-neutral-900">#{order.id.slice(0,8).toUpperCase()}</td>
                    <td className="w-px whitespace-nowrap"><p className="font-medium text-sm">{order.profiles?.phone??"—"}</p>{order.profiles?.first_name&&<p className="text-xs text-neutral-400">{order.profiles.first_name}</p>}</td>
                    {isAdmin && <td className="w-px whitespace-nowrap text-sm text-neutral-500">{order.cities?.name??"—"}</td>}
                    <td className="w-px whitespace-nowrap">
                      {order.menu_type==="frozen"
                        ? <span className="badge text-xs bg-cyan-50 text-cyan-700"><Snowflake size={10} className="inline mr-0.5"/>Заморозка</span>
                        : <span className="badge text-xs bg-orange-50 text-orange-600">Готовые</span>}
                    </td>
                    <td className="text-xs text-neutral-600 whitespace-normal min-w-[180px]">{addr||"—"}</td>
                    <td className="text-xs text-neutral-500 whitespace-normal min-w-[200px]">{items||"—"}</td>
                    <td className="text-xs text-brand-500 italic whitespace-normal min-w-[140px]">{order.comment||"—"}</td>
                    <td className="w-px whitespace-nowrap num"><p className="font-semibold">{Number(order.total_amount??0).toLocaleString("ru-RU")} ₽</p>{order.delivery_fee>0&&<p className="text-xs text-neutral-400">+{Number(order.delivery_fee).toLocaleString("ru-RU")} ₽</p>}</td>
                    <td className="w-px whitespace-nowrap"><span className={`badge ${c.bg} ${c.text}`}><span className={`w-1.5 h-1.5 rounded-full ${c.dot}`}/>{ORDER_STATUS_LABELS[order.status as OrderStatus]}</span></td>
                    <td className="w-px whitespace-nowrap text-xs text-neutral-400 num">{formatDateTime(order.created_at)}</td>
                    <td className="w-px whitespace-nowrap">{nextStatus&&<button onClick={()=>advance(order.id,nextStatus)} disabled={updating===order.id} className="btn-ghost btn-sm text-brand-500 border border-brand-200 hover:bg-brand-50 whitespace-nowrap">{updating===order.id?<Loader2 size={12} className="animate-spin"/>:<ArrowRight size={12}/>}{ORDER_STATUS_LABELS[nextStatus]}</button>}</td>
                  </tr>
                );
              })}
              {!loading&&!orders.length&&<tr><td colSpan={isAdmin?11:10} className="py-16 text-center text-neutral-400">Нет активных заказов</td></tr>}
            </tbody>
          </table>
        </div>
        {totalPages>1&&<div className="flex items-center justify-between px-5 py-3 border-t border-neutral-100"><p className="text-sm text-neutral-500 num">{page*PAGE_SIZE+1}–{Math.min((page+1)*PAGE_SIZE,total)} из {total}</p><div className="flex gap-1"><button onClick={()=>setPage(p=>Math.max(0,p-1))} disabled={page===0} className="btn-secondary btn-sm">Назад</button><button onClick={()=>setPage(p=>Math.min(totalPages-1,p+1))} disabled={page>=totalPages-1} className="btn-secondary btn-sm">Далее</button></div></div>}
      </div>
    </div>
  );
}
