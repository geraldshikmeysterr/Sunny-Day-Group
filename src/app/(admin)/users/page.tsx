"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Search, Snowflake } from "lucide-react";
import { formatDate, cn } from "@/lib/utils";

type UserRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  created_at: string;
  role: "admin" | "operator";
  assignment: string | null;
  is_active?: boolean;
};

function getAssignment(zones: any[], handlesFrozen: boolean): string | null {
  const cities = zones.map((oz: any) => oz.delivery_zones?.cities?.name).filter(Boolean);
  const unique = [...new Set<string>(cities)];
  const cityStr = unique.join(", ");
  if (handlesFrozen && !cityStr) return "frozen";
  if (handlesFrozen) return `frozen+${cityStr}`;
  return cityStr || null;
}

export default function UsersPage() {
  const supabase = createClient();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  function loadUsers() {
    setLoading(true);
    return Promise.all([
      supabase.from("operators").select("id,full_name,email,is_active,handles_frozen,created_at,operator_zones(delivery_zones(cities(name)))").order("created_at", { ascending: false }),
      supabase.from("admins").select("id,full_name,email,created_at").order("created_at", { ascending: false }),
    ]).then(([{ data: ops }, { data: adms }]) => {
      const operatorRows: UserRow[] = (ops ?? []).map((o: any) => ({
        id: o.id, full_name: o.full_name, email: o.email, created_at: o.created_at,
        role: "operator",
        assignment: getAssignment(o.operator_zones ?? [], o.handles_frozen ?? false),
        is_active: o.is_active,
      }));
      const adminRows: UserRow[] = (adms ?? []).map((a: any) => ({
        id: a.id, full_name: a.full_name, email: a.email, created_at: a.created_at,
        role: "admin", assignment: null, is_active: true,
      }));
      setUsers([...adminRows, ...operatorRows]);
      setLoading(false);
    });
  }

  useEffect(() => { loadUsers(); }, []);

  const filtered = users.filter(u =>
    !search ||
    (u.full_name ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (u.email ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div>
        <h1 className="text-3xl font-bold text-neutral-900">Пользователи</h1>
        <p className="text-sm text-neutral-500 mt-0.5">Администраторы и операторы системы</p>
      </div>

      <div className="card p-4">
        <div className="relative w-full">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Поиск по имени или email..." className="input pl-8 text-sm w-full" />
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Роль</th>
              <th className="w-full">Назначение</th>
              <th>Статус</th>
              <th>Создан</th>
            </tr>
          </thead>
          <tbody>
            {loading && Array.from({ length: 4 }, (_, i) => i).map(i => (
              <tr key={`sk-${i}`}>{Array.from({ length: 5 }, (_, j) => j).map(j => <td key={`sk-col-${j}`}><div className="skeleton h-4" /></td>)}</tr>
            ))}
            {!loading && filtered.map(u => (
              <tr key={u.id}>
                <td>
                  <p className="font-medium text-sm text-neutral-800">{u.email ?? "—"}</p>
                  <p className="text-xs text-neutral-400 font-mono">{u.id.slice(0, 8)}</p>
                </td>
                <td>
                  <span className={cn("badge text-xs", u.role === "admin" ? "bg-brand-100 text-brand-700" : "bg-sun-100 text-brand-700")}>
                    {u.role === "admin" ? "Администратор" : "Оператор"}
                  </span>
                </td>
                <td>
                  {u.role === "operator" ? (
                    <AssignmentCell assignment={u.assignment} />
                  ) : (
                    <span className="text-neutral-300 text-sm">—</span>
                  )}
                </td>
                <td>
                  <span className={cn("badge text-xs", u.is_active ? "bg-success-50 text-success-700" : "bg-danger-50 text-danger-600")}>
                    {u.is_active ? "Активен" : "Неактивен"}
                  </span>
                </td>
                <td className="text-sm text-neutral-400 num whitespace-nowrap">{formatDate(u.created_at)}</td>
              </tr>
            ))}
            {!loading && !filtered.length && (
              <tr><td colSpan={5} className="py-16 text-center text-neutral-400">Пользователи не найдены</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AssignmentCell({ assignment }: Readonly<{ assignment: string | null }>) {
  if (!assignment) return <span className="text-neutral-300 text-sm">—</span>;
  if (assignment === "frozen") {
    return (
      <span className="badge text-xs bg-cyan-50 text-cyan-700">
        <Snowflake size={10} className="inline mr-1" />Замороженная продукция
      </span>
    );
  }
  if (assignment.startsWith("frozen+")) {
    const cities = assignment.slice(7);
    return (
      <div className="flex flex-wrap gap-1 items-center">
        <span className="badge text-xs bg-cyan-50 text-cyan-700">
          <Snowflake size={10} className="inline mr-1" />Заморозка
        </span>
        <span className="text-sm text-neutral-800">{cities}</span>
      </div>
    );
  }
  return <span className="text-sm text-neutral-800">{assignment}</span>;
}
