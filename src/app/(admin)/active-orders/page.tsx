"use client";
import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime, ORDER_STATUS_LABELS, ORDER_STATUS_COLORS, ALLOWED_TRANSITIONS } from "@/lib/utils";
import { useAdmin } from "@/components/layout/AdminContext";
import { RefreshCw, Search, Loader2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { CustomSelect } from "@/components/CustomSelect";
import type { OrderStatus } from "@/lib/utils";

const PAGE_SIZE = 25;
const ACTIVE: OrderStatus[] = ["new", "preparing", "on_the_way", "ready_for_pickup"];

export default function ActiveOrdersPage() {
  const { isAdmin, cityId } = useAdmin() as any;
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
        .select("id,status,total_amount,delivery_fee,comment,created_at,payment_status,profiles(phone,first_name),addresses(full_address,street,house,apartment),order_items(item_name,quantity,item_price),cities(name)", { count: "exact" })
        .in("status", ACTIVE)
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
        .order("created_at", { ascending: false });
      if (!isAdmin && cityId) q = q.eq("city_id", cityId);
      else if (isAdmin && cityFilter !== "all") q = q.eq("city_id", cityFilter);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      const { data, count } = await q;
      setOrders(data ?? []); setTotal(count ?? 0);
    } catch { toast.error("Ошибка загрузки"); }
    finally { setLoading(false); }
  }, [page, statusFilter, cityFilter, isAdmin, cityId]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);
  useEffect(() => { setPage(0); }, [statusFilter, cityFilter]);

  useEffect(() => {
    const ch = supabase.channel("orders-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, fetchOrders)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetchOrders]);

  async function advance(orderId: string, next: OrderStatus) {
    setUpdating(orderId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/update-order-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ order_id: orderId, status: next }),
      });
      if (!res.ok) throw new Error("Ошибка обновления статуса");
      toast.success(`→ ${ORDER_STATUS_LABELS[next]}`);
      fetchOrders();
    } catch (err) {
      // No direct DB fallback — Edge Function enforces city-scoped auth
      toast.error("Не удалось обновить статус заказа");
      console.error("advance order error:", err);
    }
    setUpdating(null);
  }

  const filtered = orders.filter(o => !search || o.profiles?.phone?.includes(search) || o.id.slice(0,8).includes(search.toLowerCase()));
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const cityOptions = [{ value: "all", label: "Все города" }, ...cities.map(c => ({ value: c.id, label: c.name }))];
  const statusOptions = [{ value: "all", label: "Все статусы" }, ...ACTIVE.map(s => ({ value: s, label: ORDER_STATUS_LABELS[s] }))];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold text-neutral-900">Актуальные заказы</h1><p className="text-sm text-neutral-500 mt-0.5">{total} заказов в работе</p></div>
        <button onClick={fetchOrders} disabled={loading} className="btn-secondary btn-sm"><RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Обновить</button>
      </div>
      <div className="card p-4 flex flex-wrap gap-3 items-center sticky top-4 z-20 bg-white shadow-card">
        <div className="relative flex-1 min-w-52">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск по телефону..." className="input pl-8 text-sm" autoComplete="off" />
        </div>
        {isAdmin && <CustomSelect value={cityFilter} onChange={setCityFilter} options={cityOptions} className="w-44" />}
        <CustomSelect value={statusFilter} onChange={setStatusFilter} options={statusOptions} className="w-44" />
      </div>
      <div className="card overflow-hidden">
        <div className="table-wrapper rounded-none border-0">
          <table className="table">
            <thead><tr><th>Заказ</th><th>Клиент</th>{isAdmin && <th>Город</th>}<th>Адрес / Состав</th><th>Сумма</th><th>Статус</th><th>Дата</th><th></th></tr></thead>
            <tbody>
              {loading && Array.from({length:5}).map((_,i)=><tr key={i}>{Array.from({length:isAdmin?8:7}).map((_,j)=><td key={j}><div className="skeleton h-4 w-full"/></td>)}</tr>)}
              {!loading && filtered.map(order => {
                const c = ORDER_STATUS_COLORS[order.status as OrderStatus];
                const nextStatus = ALLOWED_TRANSITIONS[order.status as OrderStatus].find(s => s !== "cancelled");
                const addr = order.addresses?.full_address ?? `${order.addresses?.street??""} ${order.addresses?.house??""}`.trim();
                const items = order.order_items?.map((i:any)=>`${i.item_name} ×${i.quantity}`).join(", ");
                return (
                  <tr key={order.id}>
                    <td className="font-mono text-xs font-bold text-neutral-900">#{order.id.slice(0,8).toUpperCase()}</td>
                    <td><p className="font-medium text-sm">{order.profiles?.phone??"—"}</p>{order.profiles?.first_name&&<p className="text-xs text-neutral-400">{order.profiles.first_name}</p>}</td>
                    {isAdmin && <td className="text-sm text-neutral-500">{order.cities?.name??"—"}</td>}
                    <td className="max-w-xs">{addr&&<p className="text-xs text-neutral-500 truncate">{addr}</p>}<p className="text-xs text-neutral-400 truncate">{items}</p>{order.comment&&<p className="text-xs text-brand-500 italic truncate">"{order.comment}"</p>}</td>
                    <td className="num whitespace-nowrap"><p className="font-semibold">{((order.total_amount??0)/100).toLocaleString("ru-RU")} ₽</p>{order.delivery_fee>0&&<p className="text-xs text-neutral-400">+{(order.delivery_fee/100).toLocaleString("ru-RU")} ₽</p>}</td>
                    <td><span className={`badge ${c.bg} ${c.text}`}><span className={`w-1.5 h-1.5 rounded-full ${c.dot}`}/>{ORDER_STATUS_LABELS[order.status as OrderStatus]}</span></td>
                    <td className="text-xs text-neutral-400 num whitespace-nowrap">{formatDateTime(order.created_at)}</td>
                    <td>{nextStatus&&<button onClick={()=>advance(order.id,nextStatus)} disabled={updating===order.id} className="btn-ghost btn-sm text-brand-500 border border-brand-200 hover:bg-brand-50 whitespace-nowrap">{updating===order.id?<Loader2 size={12} className="animate-spin"/>:<ArrowRight size={12}/>}{ORDER_STATUS_LABELS[nextStatus]}</button>}</td>
                  </tr>
                );
              })}
              {!loading&&!filtered.length&&<tr><td colSpan={isAdmin?8:7} className="py-16 text-center text-neutral-400">Нет активных заказов</td></tr>}
            </tbody>
          </table>
        </div>
        {totalPages>1&&<div className="flex items-center justify-between px-5 py-3 border-t border-neutral-100"><p className="text-sm text-neutral-500 num">{page*PAGE_SIZE+1}–{Math.min((page+1)*PAGE_SIZE,total)} из {total}</p><div className="flex gap-1"><button onClick={()=>setPage(p=>Math.max(0,p-1))} disabled={page===0} className="btn-secondary btn-sm">Назад</button><button onClick={()=>setPage(p=>Math.min(totalPages-1,p+1))} disabled={page>=totalPages-1} className="btn-secondary btn-sm">Далее</button></div></div>}
      </div>
    </div>
  );
}
