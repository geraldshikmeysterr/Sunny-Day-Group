-- =============================================================================
-- RLS POLICIES FOR SOLNECHNYI DEN ADMIN PANEL
-- Apply via Supabase SQL Editor or supabase db push
-- =============================================================================
-- Role model:
--   admins    → full access to everything
--   operators → city-scoped; linked via operators.city_id = auth.uid()
-- =============================================================================

-- Helper: is the current user an admin?
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (SELECT 1 FROM admins WHERE id = auth.uid())
$$;

-- Helper: return the city_id for the current operator (NULL if admin or unauthenticated)
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
  OR city_id = operator_city_id()
);

DROP POLICY IF EXISTS "orders_update" ON orders;
CREATE POLICY "orders_update" ON orders FOR UPDATE USING (
  is_admin()
  OR city_id = operator_city_id()
);

-- Inserts come from the mobile app (service role or anon with RLS policy)
-- Adjust INSERT policy based on your mobile app auth model
DROP POLICY IF EXISTS "orders_insert" ON orders;
CREATE POLICY "orders_insert" ON orders FOR INSERT WITH CHECK (
  is_admin()
  OR city_id = operator_city_id()
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
  -- Operators can see profiles of users who have orders in their city
  OR id IN (
    SELECT DISTINCT user_id FROM orders WHERE city_id = operator_city_id()
  )
  -- Users can always read their own profile
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
  OR id = operator_city_id()
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
  is_admin() OR operator_city_id() IS NOT NULL
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
  is_admin() OR operator_city_id() IS NOT NULL
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
  OR city_id = operator_city_id()
);

DROP POLICY IF EXISTS "city_menu_items_update" ON city_menu_items;
CREATE POLICY "city_menu_items_update" ON city_menu_items FOR UPDATE USING (
  is_admin()
  OR city_id = operator_city_id()
) WITH CHECK (
  is_admin()
  OR city_id = operator_city_id()
);

DROP POLICY IF EXISTS "city_menu_items_insert" ON city_menu_items;
CREATE POLICY "city_menu_items_insert" ON city_menu_items FOR INSERT WITH CHECK (
  is_admin()
  OR city_id = operator_city_id()
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
  OR city_id = operator_city_id()
);

DROP POLICY IF EXISTS "restaurants_write" ON restaurants;
CREATE POLICY "restaurants_write" ON restaurants
  FOR INSERT WITH CHECK (is_admin() OR city_id = operator_city_id());

DROP POLICY IF EXISTS "restaurants_update" ON restaurants;
CREATE POLICY "restaurants_update" ON restaurants FOR UPDATE USING (
  is_admin() OR city_id = operator_city_id()
) WITH CHECK (is_admin() OR city_id = operator_city_id());

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
  OR order_id IN (SELECT id FROM orders WHERE city_id = operator_city_id())
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
  -- Operators see addresses linked to their city's orders
  OR user_id IN (
    SELECT DISTINCT user_id FROM orders WHERE city_id = operator_city_id()
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
  FOREACH t IN ARRAY ARRAY['orders','menu_items','categories','city_menu_items','carousel_cards','promocodes','cities','operators','admins','restaurants'] LOOP
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
-- VERIFY: List tables with RLS disabled (run this to check after applying)
-- SELECT tablename FROM pg_tables
-- WHERE schemaname = 'public'
--   AND tablename NOT IN (
--     SELECT tablename FROM pg_tables t
--     JOIN pg_class c ON c.relname = t.tablename
--     WHERE c.relrowsecurity = true
--   );
-- =============================================================================
