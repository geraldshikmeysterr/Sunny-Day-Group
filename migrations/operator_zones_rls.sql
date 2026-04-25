-- Update all RLS policies to use zone-based access instead of city-based.
-- Apply AFTER operator_zones.sql.
--
-- New helper functions:
--   operator_zone_ids() → uuid[]   zones the current operator owns
--   operator_city_ids() → uuid[]   cities derived from those zones
--
-- operator_city_id() is kept as-is (still works until city_id column is dropped).

-- ----------------------------------------------------------------
-- 1. New helper functions
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.operator_zone_ids()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(array_agg(zone_id), '{}')
  FROM   operator_zones
  WHERE  operator_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.operator_city_ids()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(array_agg(DISTINCT dz.city_id), '{}')
  FROM   operator_zones  oz
  JOIN   delivery_zones  dz ON dz.id = oz.zone_id
  WHERE  oz.operator_id = auth.uid()
$$;

-- ----------------------------------------------------------------
-- 2. orders  (filter by zone instead of city)
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "orders_select" ON orders;
CREATE POLICY "orders_select" ON orders FOR SELECT USING (
  is_admin()
  OR delivery_zone_id = ANY(operator_zone_ids())
);

DROP POLICY IF EXISTS "orders_update" ON orders;
CREATE POLICY "orders_update" ON orders FOR UPDATE USING (
  is_admin()
  OR delivery_zone_id = ANY(operator_zone_ids())
);

DROP POLICY IF EXISTS "orders_insert" ON orders;
CREATE POLICY "orders_insert" ON orders FOR INSERT WITH CHECK (
  is_admin()
  OR delivery_zone_id = ANY(operator_zone_ids())
);

-- ----------------------------------------------------------------
-- 3. order_items  (via parent order's zone)
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "order_items_select" ON order_items;
CREATE POLICY "order_items_select" ON order_items FOR SELECT USING (
  is_admin()
  OR order_id IN (
    SELECT id FROM orders WHERE delivery_zone_id = ANY(operator_zone_ids())
  )
);

-- ----------------------------------------------------------------
-- 4. profiles  (customers who ordered in operator's zones)
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "profiles_select" ON profiles;
CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (
  is_admin()
  OR id IN (
    SELECT DISTINCT user_id FROM orders
    WHERE delivery_zone_id = ANY(operator_zone_ids())
  )
  OR id = auth.uid()
);

-- ----------------------------------------------------------------
-- 5. addresses  (same pattern)
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "addresses_select" ON addresses;
CREATE POLICY "addresses_select" ON addresses FOR SELECT USING (
  is_admin()
  OR user_id = auth.uid()
  OR user_id IN (
    SELECT DISTINCT user_id FROM orders
    WHERE delivery_zone_id = ANY(operator_zone_ids())
  )
);

-- ----------------------------------------------------------------
-- 6. cities  (only cities the operator has zones in)
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "cities_select" ON cities;
CREATE POLICY "cities_select" ON cities FOR SELECT USING (
  is_admin()
  OR id = ANY(operator_city_ids())
);

-- ----------------------------------------------------------------
-- 7. delivery_zones  (only the operator's own zones)
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "delivery_zones_select" ON delivery_zones;
CREATE POLICY "delivery_zones_select" ON delivery_zones FOR SELECT USING (
  is_admin()
  OR id = ANY(operator_zone_ids())
);

-- ----------------------------------------------------------------
-- 8. restaurants  (by derived city)
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "restaurants_select" ON restaurants;
CREATE POLICY "restaurants_select" ON restaurants FOR SELECT USING (
  is_admin()
  OR city_id = ANY(operator_city_ids())
);

DROP POLICY IF EXISTS "restaurants_write" ON restaurants;
CREATE POLICY "restaurants_write" ON restaurants
  FOR INSERT WITH CHECK (is_admin() OR city_id = ANY(operator_city_ids()));

DROP POLICY IF EXISTS "restaurants_update" ON restaurants;
CREATE POLICY "restaurants_update" ON restaurants FOR UPDATE
  USING  (is_admin() OR city_id = ANY(operator_city_ids()))
  WITH CHECK (is_admin() OR city_id = ANY(operator_city_ids()));

-- ----------------------------------------------------------------
-- 9. city_menu_items  (by derived city)
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "city_menu_items_select" ON city_menu_items;
CREATE POLICY "city_menu_items_select" ON city_menu_items FOR SELECT USING (
  is_admin()
  OR city_id = ANY(operator_city_ids())
);

DROP POLICY IF EXISTS "city_menu_items_update" ON city_menu_items;
CREATE POLICY "city_menu_items_update" ON city_menu_items FOR UPDATE
  USING  (is_admin() OR city_id = ANY(operator_city_ids()))
  WITH CHECK (is_admin() OR city_id = ANY(operator_city_ids()));

DROP POLICY IF EXISTS "city_menu_items_insert" ON city_menu_items;
CREATE POLICY "city_menu_items_insert" ON city_menu_items FOR INSERT
  WITH CHECK (is_admin() OR city_id = ANY(operator_city_ids()));

-- ----------------------------------------------------------------
-- 10. menu_items / categories  (any operator with ≥1 zone can read)
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "menu_items_select" ON menu_items;
CREATE POLICY "menu_items_select" ON menu_items FOR SELECT USING (
  is_admin() OR cardinality(operator_zone_ids()) > 0
);

DROP POLICY IF EXISTS "categories_select" ON categories;
CREATE POLICY "categories_select" ON categories FOR SELECT USING (
  is_admin() OR cardinality(operator_zone_ids()) > 0
);
