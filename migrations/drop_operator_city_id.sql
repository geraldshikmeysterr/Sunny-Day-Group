-- Final cleanup: remove operators.city_id after everything is tested.
-- Apply ONLY after verifying zone-based access works correctly in production.
--
-- Prerequisites:
--   - operator_zones.sql applied
--   - operator_zones_rls.sql applied
--   - New admin panel code deployed and smoke-tested

ALTER TABLE public.operators DROP COLUMN IF EXISTS city_id;

-- Drop old policies that still reference operator_city_id()
-- (these coexisted with the new zone-based policies from operator_zones_rls.sql)
DROP POLICY IF EXISTS "orders_read"           ON public.orders;
DROP POLICY IF EXISTS "restaurants_read"      ON public.restaurants;
DROP POLICY IF EXISTS "city_menu_items_write" ON public.city_menu_items;
DROP POLICY IF EXISTS "profiles_read"         ON public.profiles;

-- Drop the obsolete helper function (returns NULL for everyone after city_id removal)
DROP FUNCTION IF EXISTS public.operator_city_id();
