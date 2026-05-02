-- =============================================================================
-- RLS POLICIES FOR SOLNECHNYI DEN ADMIN PANEL
-- Apply via Supabase SQL Editor or supabase db push
-- =============================================================================
-- Role model:
--   admins    → full access to everything
--   operators → zone-scoped; linked via operator_zones table
-- =============================================================================

-- Helper: is the current user an admin?
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (SELECT 1 FROM admins WHERE id = auth.uid())
$$;

-- Helper: delivery zone IDs the current operator owns (empty array if admin/unauthenticated)
CREATE OR REPLACE FUNCTION operator_zone_ids()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(array_agg(zone_id), '{}')
  FROM   operator_zones
  WHERE  operator_id = auth.uid()
$$;

-- Helper: city IDs derived from the operator's zones
CREATE OR REPLACE FUNCTION operator_city_ids()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(array_agg(DISTINCT dz.city_id), '{}')
  FROM   operator_zones  oz
  JOIN   delivery_zones  dz ON dz.id = oz.zone_id
  WHERE  oz.operator_id = auth.uid()
$$;

-- Deprecated: returns operators.city_id — kept until drop_operator_city_id.sql is applied
CREATE OR REPLACE FUNCTION operator_city_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT city_id FROM operators WHERE id = auth.uid() LIMIT 1
$$;


-- =============================================================================
-- TABLE: orders
-- =============================================================================
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orders_select" ON orders;
CREATE POLICY "orders_select" ON orders FOR SELECT USING (
  is_admin()
  OR delivery_zone_id = ANY(operator_zone_ids())
  OR (menu_type = 'frozen' AND EXISTS(
    SELECT 1 FROM operators WHERE id = auth.uid() AND handles_frozen = true
  ))
);

DROP POLICY IF EXISTS "orders_update" ON orders;
CREATE POLICY "orders_update" ON orders FOR UPDATE USING (
  is_admin()
  OR delivery_zone_id = ANY(operator_zone_ids())
  OR (menu_type = 'frozen' AND EXISTS(
    SELECT 1 FROM operators WHERE id = auth.uid() AND handles_frozen = true
  ))
);

-- Mobile app creates orders via create_order() RPC (SECURITY DEFINER).
-- This INSERT policy covers direct inserts by admin panel only.
DROP POLICY IF EXISTS "orders_insert" ON orders;
CREATE POLICY "orders_insert" ON orders FOR INSERT WITH CHECK (
  is_admin()
  OR delivery_zone_id = ANY(operator_zone_ids())
  OR menu_type = 'frozen'
);

DROP POLICY IF EXISTS "orders_delete" ON orders;
CREATE POLICY "orders_delete" ON orders FOR DELETE USING (
  is_admin()
);


-- =============================================================================
-- TABLE: profiles (clients/guests)
-- Operators need read access to see their customers
-- =============================================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select" ON profiles;
CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (
  is_admin()
  OR id IN (
    SELECT DISTINCT user_id FROM orders WHERE delivery_zone_id = ANY(operator_zone_ids())
  )
  OR id IN (
    SELECT DISTINCT user_id FROM orders WHERE menu_type = 'frozen' AND EXISTS(
      SELECT 1 FROM operators WHERE id = auth.uid() AND handles_frozen = true
    )
  )
  OR id = auth.uid()
);

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE USING (
  id = auth.uid() OR is_admin()
);


-- =============================================================================
-- TABLE: cities
-- Admins only
-- =============================================================================
ALTER TABLE cities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cities_select" ON cities;
CREATE POLICY "cities_select" ON cities FOR SELECT USING (
  is_admin()
  OR id = ANY(operator_city_ids())
);

DROP POLICY IF EXISTS "cities_all_admin" ON cities;
CREATE POLICY "cities_all_admin" ON cities
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());


-- =============================================================================
-- TABLE: operators
-- Admins only
-- =============================================================================
ALTER TABLE operators ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "operators_select" ON operators;
CREATE POLICY "operators_select" ON operators FOR SELECT USING (
  is_admin()
  OR id = auth.uid()
);

DROP POLICY IF EXISTS "operators_all_admin" ON operators;
CREATE POLICY "operators_all_admin" ON operators
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());


-- =============================================================================
-- TABLE: admins
-- Admins only (superadmin manages admins)
-- =============================================================================
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_select" ON admins;
CREATE POLICY "admins_select" ON admins FOR SELECT USING (
  is_admin()
);

DROP POLICY IF EXISTS "admins_all_admin" ON admins;
CREATE POLICY "admins_all_admin" ON admins
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());


-- =============================================================================
-- TABLE: menu_items (global catalog)
-- Admins: full CRUD; Operators: read-only
-- =============================================================================
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "menu_items_select" ON menu_items;
CREATE POLICY "menu_items_select" ON menu_items FOR SELECT USING (
  is_admin() OR cardinality(operator_zone_ids()) > 0
);

DROP POLICY IF EXISTS "menu_items_write_admin" ON menu_items;
CREATE POLICY "menu_items_write_admin" ON menu_items
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());


-- =============================================================================
-- TABLE: categories
-- Admins: full CRUD; Operators: read-only
-- =============================================================================
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "categories_select" ON categories;
CREATE POLICY "categories_select" ON categories FOR SELECT USING (
  is_admin() OR cardinality(operator_zone_ids()) > 0
);

DROP POLICY IF EXISTS "categories_write_admin" ON categories;
CREATE POLICY "categories_write_admin" ON categories
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());


-- =============================================================================
-- TABLE: menu_types
-- Read-only for all authenticated users
-- =============================================================================
ALTER TABLE menu_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "menu_types_select" ON menu_types;
CREATE POLICY "menu_types_select" ON menu_types FOR SELECT USING (
  auth.uid() IS NOT NULL
);

DROP POLICY IF EXISTS "menu_types_write_admin" ON menu_types;
CREATE POLICY "menu_types_write_admin" ON menu_types
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());


-- =============================================================================
-- TABLE: city_menu_items (per-city pricing / availability)
-- Admins: full CRUD; Operators: only their city
-- =============================================================================
ALTER TABLE city_menu_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "city_menu_items_select" ON city_menu_items;
CREATE POLICY "city_menu_items_select" ON city_menu_items FOR SELECT USING (
  is_admin()
  OR city_id = ANY(operator_city_ids())
);

DROP POLICY IF EXISTS "city_menu_items_update" ON city_menu_items;
CREATE POLICY "city_menu_items_update" ON city_menu_items FOR UPDATE USING (
  is_admin()
  OR city_id = ANY(operator_city_ids())
) WITH CHECK (
  is_admin()
  OR city_id = ANY(operator_city_ids())
);

DROP POLICY IF EXISTS "city_menu_items_insert" ON city_menu_items;
CREATE POLICY "city_menu_items_insert" ON city_menu_items FOR INSERT WITH CHECK (
  is_admin()
  OR city_id = ANY(operator_city_ids())
);

DROP POLICY IF EXISTS "city_menu_items_delete" ON city_menu_items;
CREATE POLICY "city_menu_items_delete" ON city_menu_items FOR DELETE USING (
  is_admin()
);


-- =============================================================================
-- TABLE: restaurants
-- Admins: full CRUD; Operators: only their city
-- =============================================================================
ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "restaurants_select" ON restaurants;
CREATE POLICY "restaurants_select" ON restaurants FOR SELECT USING (
  is_admin()
  OR city_id = ANY(operator_city_ids())
);

DROP POLICY IF EXISTS "restaurants_write" ON restaurants;
CREATE POLICY "restaurants_write" ON restaurants
  FOR INSERT WITH CHECK (is_admin() OR city_id = ANY(operator_city_ids()));

DROP POLICY IF EXISTS "restaurants_update" ON restaurants;
CREATE POLICY "restaurants_update" ON restaurants FOR UPDATE USING (
  is_admin() OR city_id = ANY(operator_city_ids())
) WITH CHECK (is_admin() OR city_id = ANY(operator_city_ids()));

DROP POLICY IF EXISTS "restaurants_delete" ON restaurants;
CREATE POLICY "restaurants_delete" ON restaurants FOR DELETE USING (is_admin());


-- =============================================================================
-- TABLE: promocodes
-- Admins only
-- =============================================================================
ALTER TABLE promocodes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "promocodes_all_admin" ON promocodes;
CREATE POLICY "promocodes_all_admin" ON promocodes
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- Mobile app reads active promos via service role or anon — adjust if needed:
DROP POLICY IF EXISTS "promocodes_select_authenticated" ON promocodes;
CREATE POLICY "promocodes_select_authenticated" ON promocodes FOR SELECT USING (
  is_admin() OR (is_active = true AND auth.uid() IS NOT NULL)
);


-- =============================================================================
-- TABLE: carousel_cards
-- Admins only (operators have no access)
-- =============================================================================
ALTER TABLE carousel_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "carousel_cards_all_admin" ON carousel_cards;
CREATE POLICY "carousel_cards_all_admin" ON carousel_cards
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- Mobile app needs read access — use service role or add anon SELECT policy:
DROP POLICY IF EXISTS "carousel_cards_select_all" ON carousel_cards;
CREATE POLICY "carousel_cards_select_all" ON carousel_cards FOR SELECT USING (
  is_active = true OR is_admin()
);


-- =============================================================================
-- TABLE: order_items
-- Scoped via parent order's city
-- =============================================================================
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_items_select" ON order_items;
CREATE POLICY "order_items_select" ON order_items FOR SELECT USING (
  is_admin()
  OR order_id IN (
    SELECT id FROM orders WHERE delivery_zone_id = ANY(operator_zone_ids())
  )
  OR order_id IN (
    SELECT id FROM orders WHERE menu_type = 'frozen' AND EXISTS(
      SELECT 1 FROM operators WHERE id = auth.uid() AND handles_frozen = true
    )
  )
);


-- =============================================================================
-- TABLE: addresses
-- Users own their addresses; admins and operators (for orders) can read
-- =============================================================================
ALTER TABLE addresses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "addresses_select" ON addresses;
CREATE POLICY "addresses_select" ON addresses FOR SELECT USING (
  is_admin()
  OR user_id = auth.uid()
  OR user_id IN (
    SELECT DISTINCT user_id FROM orders WHERE delivery_zone_id = ANY(operator_zone_ids())
  )
);

DROP POLICY IF EXISTS "addresses_own" ON addresses;
CREATE POLICY "addresses_own" ON addresses
  FOR ALL USING (user_id = auth.uid() OR is_admin())
  WITH CHECK (user_id = auth.uid() OR is_admin());


-- =============================================================================
-- TABLE: audit_log
-- Immutable record of all write operations by admin/operator users.
-- Populated via per-table triggers; only admins can read; nobody can UPDATE/DELETE.
-- =============================================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid        REFERENCES auth.users ON DELETE SET NULL,
  action      text        NOT NULL,   -- 'INSERT' | 'UPDATE' | 'DELETE'
  table_name  text        NOT NULL,
  record_id   uuid,
  old_data    jsonb,
  new_data    jsonb,
  created_at  timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_log_select_admin" ON audit_log;
CREATE POLICY "audit_log_select_admin" ON audit_log FOR SELECT USING (is_admin());

-- Triggers write via SECURITY DEFINER function — no direct INSERT/UPDATE/DELETE for users.
DROP POLICY IF EXISTS "audit_log_insert_deny" ON audit_log;
CREATE POLICY "audit_log_insert_deny" ON audit_log FOR INSERT WITH CHECK (false);

-- Helper: called by every trigger below (SECURITY DEFINER bypasses RLS)
CREATE OR REPLACE FUNCTION audit_trigger_fn()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO audit_log (user_id, action, table_name, record_id, old_data, new_data)
  VALUES (
    auth.uid(),
    TG_OP,
    TG_TABLE_NAME,
    CASE TG_OP WHEN 'DELETE' THEN (OLD.id)::uuid ELSE (NEW.id)::uuid END,
    CASE TG_OP WHEN 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE TG_OP WHEN 'DELETE' THEN NULL ELSE to_jsonb(NEW) END
  );
  RETURN NULL;
END;
$$;

-- Attach audit trigger to tables that matter for security/compliance
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['orders','menu_items','categories','city_menu_items','carousel_cards','promocodes','cities','operators','admins','restaurants','delivery_zones'] LOOP
    EXECUTE format('
      DROP TRIGGER IF EXISTS audit_%I ON %I;
      CREATE TRIGGER audit_%I
        AFTER INSERT OR UPDATE OR DELETE ON %I
        FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();
    ', t, t, t, t);
  END LOOP;
END;
$$;


-- =============================================================================
-- TABLE: delivery_zones
-- Admins: full CRUD; Operators: SELECT own city (incl. inactive); Public: SELECT active only
--
-- Structure (for reference):
--   id uuid, city_id uuid FK→cities, name text,
--   delivery_fee numeric, free_from numeric, min_order numeric,
--   geojson jsonb, zone_polygon geography, is_active boolean,
--   sort_order int, created_at timestamptz, updated_at timestamptz
--
-- Notes:
--   - "public read active" allows anon/mobile app to read is_active=true zones
--   - Operators see ALL zones for their city (incl. inactive) via delivery_zones_select
--   - Only superadmin can INSERT/UPDATE/DELETE (cities page is ADMIN_ONLY_ROUTE)
--   - audit_trigger_fn() logs all writes to audit_log
-- =============================================================================
ALTER TABLE delivery_zones ENABLE ROW LEVEL SECURITY;

-- updated_at: uses shared fn_update_updated_at() like all other tables
ALTER TABLE delivery_zones
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now() NOT NULL;

DROP TRIGGER IF EXISTS delivery_zones_updated_at ON delivery_zones;
CREATE TRIGGER delivery_zones_updated_at
  BEFORE UPDATE ON delivery_zones
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

-- CHECK constraints: prevent negative monetary values
ALTER TABLE delivery_zones
  DROP CONSTRAINT IF EXISTS delivery_zones_fee_non_negative;
ALTER TABLE delivery_zones
  ADD CONSTRAINT delivery_zones_fee_non_negative CHECK (delivery_fee >= 0);

ALTER TABLE delivery_zones
  DROP CONSTRAINT IF EXISTS delivery_zones_min_order_non_negative;
ALTER TABLE delivery_zones
  ADD CONSTRAINT delivery_zones_min_order_non_negative CHECK (min_order >= 0);

ALTER TABLE delivery_zones
  DROP CONSTRAINT IF EXISTS delivery_zones_free_from_positive;
ALTER TABLE delivery_zones
  ADD CONSTRAINT delivery_zones_free_from_positive CHECK (free_from IS NULL OR free_from >= 0);

-- DROP old policy: used fn_is_admin() (legacy name), no explicit WITH CHECK
DROP POLICY IF EXISTS "delivery_zones: admin all" ON delivery_zones;

-- Superadmin: full CRUD with explicit WITH CHECK (consistent with all other tables)
DROP POLICY IF EXISTS "delivery_zones_write_admin" ON delivery_zones;
CREATE POLICY "delivery_zones_write_admin" ON delivery_zones
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- Operators: SELECT only, their own zones (includes inactive — needed for admin panel)
DROP POLICY IF EXISTS "delivery_zones_select" ON delivery_zones;
CREATE POLICY "delivery_zones_select" ON delivery_zones
  FOR SELECT USING (
    is_admin()
    OR id = ANY(operator_zone_ids())
  );

-- Public / mobile app: active zones only (no auth required — anon GRANT already exists)
-- Policy name kept as-is to match what is already in the DB.
DROP POLICY IF EXISTS "delivery_zones: public read active" ON delivery_zones;
CREATE POLICY "delivery_zones: public read active" ON delivery_zones
  FOR SELECT USING (is_active = true);

-- GRANT: service_role, anon, authenticated already granted at table creation.
-- If re-creating the table from scratch, run:
--   GRANT SELECT ON delivery_zones TO anon;
--   GRANT ALL ON delivery_zones TO authenticated;
--   GRANT ALL ON delivery_zones TO service_role;


-- =============================================================================
-- TABLE: operator_zones
-- Maps operators to the specific delivery zones they manage.
-- Replaces the old operators.city_id approach.
-- Structure: operator_id uuid FK→operators, zone_id uuid FK→delivery_zones
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.operator_zones (
  operator_id uuid NOT NULL REFERENCES public.operators(id)      ON DELETE CASCADE,
  zone_id     uuid NOT NULL REFERENCES public.delivery_zones(id) ON DELETE CASCADE,
  PRIMARY KEY (operator_id, zone_id)
);

ALTER TABLE public.operator_zones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "operator_zones_admin" ON public.operator_zones;
CREATE POLICY "operator_zones_admin" ON public.operator_zones
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "operator_zones_self" ON public.operator_zones;
CREATE POLICY "operator_zones_self" ON public.operator_zones
  FOR SELECT USING (operator_id = auth.uid());

GRANT SELECT ON public.operator_zones TO authenticated;
GRANT ALL    ON public.operator_zones TO service_role;


-- =============================================================================
-- VERIFY: List tables with RLS disabled (run this to check after applying)
-- SELECT tablename FROM pg_tables
-- WHERE schemaname = 'public'
--   AND tablename NOT IN (
--     SELECT tablename FROM pg_tables t
--     JOIN pg_class c ON c.relname = t.tablename
--     WHERE c.relrowsecurity = true
--   );
-- =============================================================================
