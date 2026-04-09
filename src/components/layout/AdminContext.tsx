"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type AdminCtx = { isAdmin: boolean; cityId: string | null; loaded: boolean };
const Ctx = createContext<AdminCtx>({ isAdmin: false, cityId: null, loaded: false });

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const [ctx, setCtx] = useState<AdminCtx>({ isAdmin: false, cityId: null, loaded: false });

  useEffect(() => {
    const supabase = createClient();
    // onAuthStateChange избегает Lock ошибки в отличие от getUser
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!session?.user) {
        setCtx({ isAdmin: false, cityId: null, loaded: true });
        return;
      }
      const userId = session.user.id;
      const { data: admin } = await supabase
        .from("admins").select("id").eq("id", userId).maybeSingle();
      if (admin) {
        setCtx({ isAdmin: true, cityId: null, loaded: true });
        return;
      }
      const { data: op } = await supabase
        .from("operators").select("city_id").eq("id", userId).maybeSingle();
      setCtx({ isAdmin: false, cityId: op?.city_id ?? null, loaded: true });
    });
    return () => subscription.unsubscribe();
  }, []);

  return <Ctx.Provider value={ctx}>{children}</Ctx.Provider>;
}

export const useAdmin = () => useContext(Ctx);
