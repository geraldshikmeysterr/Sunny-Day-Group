"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type AdminCtx = {
  isAdmin:  boolean;
  zoneIds:  string[];
  cityIds:  string[];
  loaded:   boolean;
};

const Ctx = createContext<AdminCtx>({ isAdmin: false, zoneIds: [], cityIds: [], loaded: false });

export function AdminProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [ctx, setCtx] = useState<AdminCtx>({ isAdmin: false, zoneIds: [], cityIds: [], loaded: false });

  useEffect(() => {
    const supabase = createClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!session?.user) {
        setCtx({ isAdmin: false, zoneIds: [], cityIds: [], loaded: true });
        return;
      }
      const userId = session.user.id;

      const { data: admin } = await supabase
        .from("admins").select("id").eq("id", userId).maybeSingle();
      if (admin) {
        setCtx({ isAdmin: true, zoneIds: [], cityIds: [], loaded: true });
        return;
      }

      const { data: op } = await supabase
        .from("operators").select("id").eq("id", userId).maybeSingle();
      if (!op) {
        setCtx({ isAdmin: false, zoneIds: [], cityIds: [], loaded: true });
        return;
      }

      const { data: opZones } = await supabase
        .from("operator_zones")
        .select("zone_id, delivery_zones(city_id)")
        .eq("operator_id", userId);

      const zoneIds = opZones?.map((z: any) => z.zone_id) ?? [];
      const cityIds = [...new Set(
        opZones?.map((z: any) => z.delivery_zones?.city_id).filter(Boolean) ?? []
      )] as string[];

      setCtx({ isAdmin: false, zoneIds, cityIds, loaded: true });
    });
    return () => subscription.unsubscribe();
  }, []);

  return <Ctx.Provider value={ctx}>{children}</Ctx.Provider>;
}

export const useAdmin = () => useContext(Ctx);
