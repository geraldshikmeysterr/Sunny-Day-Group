"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type AdminCtx = {
  isAdmin:       boolean;
  zoneIds:       string[];
  cityIds:       string[];
  handlesFrozen: boolean;
  loaded:        boolean;
};

const Ctx = createContext<AdminCtx>({ isAdmin: false, zoneIds: [], cityIds: [], handlesFrozen: false, loaded: false });

export function AdminProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [userId, setUserId] = useState<string | null | undefined>(undefined);
  const [ctx, setCtx] = useState<AdminCtx>({ isAdmin: false, zoneIds: [], cityIds: [], handlesFrozen: false, loaded: false });

  // Track auth state — NO DB calls inside the callback to avoid session-lock deadlock.
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Fetch role data after userId is known (outside the auth callback).
  useEffect(() => {
    if (userId === undefined) return;
    if (userId === null) {
      setCtx({ isAdmin: false, zoneIds: [], cityIds: [], handlesFrozen: false, loaded: true });
      return;
    }

    const supabase = createClient();

    async function fetchRole() {
      const { data: admin } = await supabase
        .from("admins").select("id").eq("id", userId).maybeSingle();
      if (admin) {
        setCtx({ isAdmin: true, zoneIds: [], cityIds: [], handlesFrozen: false, loaded: true });
        return;
      }

      const { data: op } = await supabase
        .from("operators").select("id,handles_frozen").eq("id", userId).maybeSingle();
      if (!op) {
        setCtx({ isAdmin: false, zoneIds: [], cityIds: [], handlesFrozen: false, loaded: true });
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

      setCtx({ isAdmin: false, zoneIds, cityIds, handlesFrozen: op.handles_frozen ?? false, loaded: true });
    }

    fetchRole();
  }, [userId]);

  return <Ctx.Provider value={ctx}>{children}</Ctx.Provider>;
}

export const useAdmin = () => useContext(Ctx);
