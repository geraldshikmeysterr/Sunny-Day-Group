-- Final cleanup: remove operators.city_id after everything is tested.
-- Apply ONLY after verifying zone-based access works correctly in production.
--
-- Prerequisites:
--   - operator_zones.sql applied
--   - operator_zones_rls.sql applied
--   - New admin panel code deployed and smoke-tested

ALTER TABLE public.operators DROP COLUMN IF EXISTS city_id;

-- operator_city_id() is now obsolete (returns NULL for everyone); drop it.
DROP FUNCTION IF EXISTS public.operator_city_id();
