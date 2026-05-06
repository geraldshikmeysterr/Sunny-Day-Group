"use client";
import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime, ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from "@/lib/utils";
import { useAdmin } from "@/components/layout/AdminContext";
import { RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { CustomSelect } from "@/components/CustomSelect";
import type { OrderStatus } from "@/lib/utils";

const PAGE_SIZE = 25;

export default function CompletedOrdersPage() {
  const { isAdmin, zoneIds } = useAdmin() as any;
  const supabase = createClient();
  const [orders, setOrders] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [cityFilter, setCityFilter] = useState("all");
  const [cities, setCities] = useState<any[]>([]);

  useEffect(() => {
    if (isAdmin) createClient().from("cities").select("id,name").order("name").then(({data})=>setCities(data??[]));
  }, [isAdmin]);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase.from("orders")
        .select("id,status,total_amount,delivery_fee,discount_amount,promocode_code,created_at,payment_status,comment,profiles(phone,first_name),addresses(full_address,street,house),order_items(item_name,quantity),cities(name)", { count: "exact" })
        .in("status", ["delivered","cancelled"])
        .range(page*PAGE_SIZE,(page+1)*PAGE_SIZE-1)
        .order("created_at",{ascending:false});
      if (!isAdmin && zoneIds.length > 0) q = q.in("delivery_zone_id", zoneIds);
      else if (isAdmin && cityFilter !== "all") q = q.eq("city_id", cityFilter);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      if (search.trim()) {
        const safe = search.trim().replaceAll(/[%_\\]/g, String.raw`\$&`);
        q = q.or(`id.ilike.%${safe}%,profiles.phone.ilike.%${safe}%`);
      }
      const { data, count } = await q;
      setOrders(data??[]); setTotal(count??0);
    } catch { toast.error("Ошибка загрузки"); }
    finally { setLoading(false); }
  }, [page, statusFilter, cityFilter, isAdmin, zoneIds, search]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);
  useEffect(() => { setPage(0); }, [statusFilter, cityFilter, search]);

  const totalPages = Math.ceil(total/PAGE_SIZE);
  const cityOptions = [{ value: "all", label: "Все города" }, ...cities.map(c=>({value:c.id,label:c.name}))];
  const statusOptions = [{ value:"all", label:"Все статусы" }, {value:"delivered",label:"Доставлен"}, {value:"cancelled",label:"Отменён"}];

  return (
    <div className="p-6 max-w-full mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold text-neutral-900">Выполненные заказы</h1><p className="text-sm text-neutral-500 mt-0.5">{total} заказов завершено</p></div>
        <button onClick={fetchOrders} disabled={loading} className="btn-secondary btn-sm"><RefreshCw size={14} className={loading?"animate-spin":""}/> Обновить</button>
      </div>
      <div className="card p-4 flex flex-wrap gap-3 sticky top-4 z-20 bg-white shadow-card">
        <div className="relative flex-1 min-w-52"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Поиск..." className="input pl-8 text-sm" autoComplete="off"/></div>
        {isAdmin && <CustomSelect value={cityFilter} onChange={setCityFilter} options={cityOptions} className="w-44"/>}
        <CustomSelect value={statusFilter} onChange={setStatusFilter} options={statusOptions} className="w-44"/>
      </div>
      <div className="card overflow-hidden">
        <div className="table-wrapper rounded-none border-0">
          <table className="table">
            <thead><tr><th>Заказ</th><th>Клиент</th>{isAdmin&&<th>Город</th>}<th>Адрес</th><th>Состав</th><th>Комментарий</th><th>Промокод</th><th>Сумма</th><th>Статус</th><th>Оплата</th><th>Дата</th></tr></thead>
            <tbody>
              {loading&&Array.from({length:6},(_,i)=>i).map(i=><tr key={`sk-${i}`}>{Array.from({length:isAdmin?11:10},(_,j)=>j).map(j=><td key={`sk-col-${j}`}><div className="skeleton h-4"/></td>)}</tr>)}
              {!loading&&orders.map(order=>{
                const c=ORDER_STATUS_COLORS[order.status as OrderStatus];
                let paymentLabel = "—";
                if (order.payment_status === "paid") paymentLabel = "Оплачен";
                else if (order.payment_status === "refunded") paymentLabel = "Возврат";
                const paymentClass = order.payment_status === "paid" ? "bg-success-50 text-success-700" : "bg-neutral-100 text-neutral-500";
                return(<tr key={order.id}>
                  <td className="w-px whitespace-nowrap font-mono text-xs font-bold">#{order.id.slice(0,8).toUpperCase()}</td>
                  <td className="w-px whitespace-nowrap"><p className="font-medium text-sm">{order.profiles?.phone??"—"}</p>{order.profiles?.first_name&&<p className="text-xs text-neutral-400">{order.profiles.first_name}</p>}</td>
                  {isAdmin&&<td className="w-px whitespace-nowrap text-sm text-neutral-500">{order.cities?.name??"—"}</td>}
                  <td className="text-xs text-neutral-600 whitespace-normal min-w-[180px]">{(order.addresses?.full_address ?? `${order.addresses?.street??""} ${order.addresses?.house??""}`.trim()) || "—"}</td>
                  <td className="text-xs text-neutral-500 whitespace-normal min-w-[200px]">{order.order_items?.map((i:any)=>`${i.item_name} ×${i.quantity}`).join(", ")||"—"}</td>
                  <td className="text-xs text-brand-500 italic whitespace-normal min-w-[140px]">{order.comment||"—"}</td>
                  <td className="w-px whitespace-nowrap">{order.promocode_code?<><p className="text-xs font-mono font-semibold text-neutral-700">{order.promocode_code}</p><p className="text-xs text-success-600">−{Number(order.discount_amount??0).toLocaleString("ru-RU")} ₽</p></>:<span className="text-neutral-300">—</span>}</td>
                  <td className="w-px whitespace-nowrap num font-semibold">{Number(order.total_amount??0).toLocaleString("ru-RU")} ₽</td>
                  <td className="w-px whitespace-nowrap"><span className={`badge ${c.bg} ${c.text}`}><span className={`w-1.5 h-1.5 rounded-full ${c.dot}`}/>{ORDER_STATUS_LABELS[order.status as OrderStatus]}</span></td>
                  <td className="w-px whitespace-nowrap"><span className={`badge text-xs ${paymentClass}`}>{paymentLabel}</span></td>
                  <td className="w-px whitespace-nowrap text-xs text-neutral-400 num">{formatDateTime(order.created_at)}</td>
                </tr>);
              })}
              {!loading&&!orders.length&&<tr><td colSpan={isAdmin?11:10} className="py-16 text-center text-neutral-400">Нет завершённых заказов</td></tr>}
            </tbody>
          </table>
        </div>
        {totalPages>1&&<div className="flex items-center justify-between px-5 py-3 border-t border-neutral-100"><p className="text-sm text-neutral-500 num">{page*PAGE_SIZE+1}–{Math.min((page+1)*PAGE_SIZE,total)} из {total}</p><div className="flex gap-1"><button onClick={()=>setPage(p=>Math.max(0,p-1))} disabled={page===0} className="btn-secondary btn-sm">Назад</button><button onClick={()=>setPage(p=>Math.min(totalPages-1,p+1))} disabled={page>=totalPages-1} className="btn-secondary btn-sm">Далее</button></div></div>}
      </div>
    </div>
  );
}
