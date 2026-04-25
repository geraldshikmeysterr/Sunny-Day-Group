-- Rebind operators from cities to delivery zones.
--
-- Apply order:
--   1. This file  (operator_zones table + initial data)
--   2. operator_zones_rls.sql  (update existing RLS policies)
--   3. Deploy new admin panel code
--   4. drop_operator_city_id.sql  (final cleanup — after smoke test)

-- ----------------------------------------------------------------
-- 1. Join table: operator → zones (many-to-many)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.operator_zones (
  operator_id uuid NOT NULL REFERENCES public.operators(id)       ON DELETE CASCADE,
  zone_id     uuid NOT NULL REFERENCES public.delivery_zones(id)  ON DELETE CASCADE,
  PRIMARY KEY (operator_id, zone_id)
);

-- Audit trigger
DROP TRIGGER IF EXISTS audit_operator_zones ON public.operator_zones;
CREATE TRIGGER audit_operator_zones
  AFTER INSERT OR UPDATE OR DELETE ON public.operator_zones
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

-- ----------------------------------------------------------------
-- 2. RLS
-- ----------------------------------------------------------------
ALTER TABLE public.operator_zones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "operator_zones_admin" ON public.operator_zones;
CREATE POLICY "operator_zones_admin" ON public.operator_zones
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "operator_zones_self" ON public.operator_zones;
CREATE POLICY "operator_zones_self" ON public.operator_zones
  FOR SELECT USING (operator_id = auth.uid());

-- ----------------------------------------------------------------
-- 3. Migrate existing data:
--    each operator inherits ALL zones of their current city
-- ----------------------------------------------------------------
INSERT INTO public.operator_zones (operator_id, zone_id)
SELECT o.id, dz.id
FROM   public.operators      o
JOIN   public.delivery_zones dz ON dz.city_id = o.city_id
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------------
-- 4. GRANT
-- ----------------------------------------------------------------
GRANT SELECT                         ON public.operator_zones TO authenticated;
GRANT ALL                            ON public.operator_zones TO service_role;
