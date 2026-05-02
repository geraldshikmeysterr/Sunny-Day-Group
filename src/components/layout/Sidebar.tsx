"use client";
import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  ShoppingBag, CheckCircle2, UtensilsCrossed, Building2,
  MapPin, Ticket, Users, UserCog, LogOut, ChevronRight, Calendar, LayoutList, Settings, Snowflake,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAdmin } from "@/components/layout/AdminContext";

const NAV = [
  { title: "Основное", items: [
    { href: "/active-orders",     label: "Актуальные заказы",  icon: ShoppingBag,    roles: ["superadmin","operator"] },
    { href: "/completed-orders",  label: "Выполненные заказы", icon: CheckCircle2,   roles: ["superadmin","operator"] },
  ]},
  { title: "Меню", items: [
    { href: "/menu-editor",       label: "Редактор меню",      icon: UtensilsCrossed,roles: ["superadmin"] },
    { href: "/menu/availability", label: "По городам",         icon: Building2,      roles: ["superadmin","operator"] },
    { href: "/menu/schedule",     label: "По дням",           icon: Calendar,       roles: ["superadmin"] },
    { href: "/carousel",          label: "Карусель",           icon: LayoutList,     roles: ["superadmin"] },
  ]},
  { title: "Управление", items: [
    { href: "/cities",      label: "Города",     icon: Building2, roles: ["superadmin"] },
    { href: "/restaurants", label: "Рестораны",  icon: MapPin,    roles: ["superadmin","operator"] },
    { href: "/promos",      label: "Промокоды",  icon: Ticket,    roles: ["superadmin"] },
    { href: "/clients",     label: "Гости",      icon: Users,     roles: ["superadmin","operator"] },
  ]},
  { title: "Система", items: [
    { href: "/frozen",    label: "Заморозка",    icon: Snowflake, roles: ["superadmin"] },
    { href: "/users",     label: "Пользователи", icon: UserCog,  roles: ["superadmin"] },
    { href: "/settings",  label: "Настройки",    icon: Settings, roles: ["superadmin", "operator"] },
  ]},
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const { isAdmin, zoneIds, loaded } = useAdmin() as any;

  let role: "superadmin" | "operator" | null = null;
  if (loaded) {
    if (isAdmin) role = "superadmin";
    else if (zoneIds?.length > 0) role = "operator";
  }

  useEffect(() => {
    if (loaded && role === null) {
      supabase.auth.signOut().then(() => router.replace("/login"));
    }
  }, [loaded, role]);

  const isActive = (href: string) => {
    if (href === "/menu-editor") return pathname === "/menu-editor";
    if (href === "/menu/availability") return pathname.startsWith("/menu/availability");
    if (href === "/menu/schedule") return pathname.startsWith("/menu/schedule");
    return pathname.startsWith(href);
  };

  const logout = async () => { await supabase.auth.signOut(); router.replace("/login"); };

  const visibleNav = NAV.map(s => ({
    ...s,
    items: s.items.filter(i => role === null ? i.roles.includes("operator") : i.roles.includes(role)),
  })).filter(s => s.items.length > 0);

  return (
    <aside className="fixed left-0 top-0 h-screen flex flex-col z-30"
      style={{ width: "var(--sidebar-width)", background: "linear-gradient(180deg, #F57300 0%, #E06500 100%)" }}>

      <div className="shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.15)", padding: "12px 12px" }}>
        <img
          src="/logo.png"
          alt="Солнечный день"
          style={{ height: 36, objectFit: "contain", objectPosition: "left center", display: "block" }}
        />
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {visibleNav.map(section => (
          <div key={section.title}>
            <p className="text-xs font-semibold uppercase tracking-wider px-3 mb-1.5"
              style={{ color: "rgba(255,255,255,0.45)" }}>
              {section.title}
            </p>
            <div className="space-y-0.5">
              {section.items.map(item => {
                const active = isActive(item.href);
                const Icon = item.icon;
                return (
                  <Link key={item.href} href={item.href}
                    className={cn("flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
                      active ? "shadow-sm" : "text-white/75 hover:text-white hover:bg-white/10")}
                    style={active ? { background: "rgba(255,255,255,0.95)", color: "#E06500" } : {}}>
                    <Icon size={16} className="shrink-0" />
                    <span className="truncate">{item.label}</span>
                    {active && <ChevronRight size={13} className="ml-auto shrink-0 opacity-50" />}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="px-3 py-4 shrink-0" style={{ borderTop: "1px solid rgba(255,255,255,0.15)" }}>
        <button onClick={logout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 transition-all">
          <LogOut size={16} className="shrink-0" /> Выйти
        </button>
      </div>
    </aside>
  );
}
