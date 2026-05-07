-- =============================================================================
-- RLS POLICIES FOR SOLNECHNYI DEN ADMIN PANEL
-- Apply via Supabase SQL Editor or supabase db push
-- Last updated: 2026-05-03 (security audit fixes)
-- =============================================================================
-- Role model:
--   admins    → full access to everything
--   operators → zone-scoped; linked via operator_zones table
--   anon/authenticated (mobile app users) → read public data, own records
-- =============================================================================

-- ─── Helper functions ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM admins WHERE id = auth.uid())
$$;

CREATE OR REPLACE FUNCTION operator_zone_ids()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(array_agg(zone_id), '{}')
  FROM   operator_zones
  WHERE  operator_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION operator_city_ids()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(array_agg(DISTINCT dz.city_id), '{}')
  FROM   operator_zones  oz
  JOIN   delivery_zones  dz ON dz.id = oz.zone_id
  WHERE  oz.operator_id = auth.uid()
$$;

-- Atomic OTP insert: invalidates previous codes + inserts new one in one transaction
CREATE OR REPLACE FUNCTION public.insert_otp_code(
  p_phone     text,
  p_code      text,
  p_expires_at timestamptz
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE otp_codes SET used = true WHERE phone = p_phone AND used = false;
  INSERT INTO otp_codes (phone, code, expires_at) VALUES (p_phone, p_code, p_expires_at);
END;
$$;

-- ─── Function grants (SECURITY) ──────────────────────────────────────────────

-- vault_secret: accessible to service_role only (not to anon/authenticated)
REVOKE EXECUTE ON FUNCTION public.vault_secret(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.vault_secret(text) TO service_role;

-- fn_create_city_with_operator: admin panel only (authenticated session)
REVOKE EXECUTE ON FUNCTION public.fn_create_city_with_operator(text,text,text,text,text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_create_city_with_operator(text,text,text,text,text) TO authenticated;

-- insert_otp_code: called only by edge functions via service_role key
REVOKE EXECUTE ON FUNCTION public.insert_otp_code(text, text, timestamptz) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.insert_otp_code(text, text, timestamptz) TO service_role;


-- =============================================================================
-- TABLE: admins
-- =============================================================================
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_select"       ON admins;
DROP POLICY IF EXISTS "admins_write"        ON admins;
DROP POLICY IF EXISTS "admins_all"          ON admins;
DROP POLICY IF EXISTS "admins_all_admin"    ON admins;
DROP POLICY IF EXISTS "admins: view own record" ON admins;

CREATE POLICY "admins_select" ON admins FOR SELECT USING (is_admin() OR auth.uid() = id);
CREATE POLICY "admins_write"  ON admins FOR ALL    USING (is_admin()) WITH CHECK (is_admin());


-- =============================================================================
-- TABLE: operators
-- =============================================================================
ALTER TABLE operators ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "operators_select"        ON operators;
DROP POLICY IF EXISTS "operators_write"         ON operators;
DROP POLICY IF EXISTS "operators_all"           ON operators;
DROP POLICY IF EXISTS "operators_all_admin"     ON operators;
DROP POLICY IF EXISTS "operators: admin all"    ON operators;
DROP POLICY IF EXISTS "operators: view own record" ON operators;

CREATE POLICY "operators_select" ON operators FOR SELECT USING (is_admin() OR auth.uid() = id);
CREATE POLICY "operators_write"  ON operators FOR ALL    USING (is_admin()) WITH CHECK (is_admin());


-- =============================================================================
-- TABLE: operator_zones
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.operator_zones (
  operator_id uuid NOT NULL REFERENCES public.operators(id)      ON DELETE CASCADE,
  zone_id     uuid NOT NULL REFERENCES public.delivery_zones(id) ON DELETE CASCADE,
  PRIMARY KEY (operator_id, zone_id)
);
ALTER TABLE public.operator_zones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "operator_zones_admin" ON public.operator_zones;
DROP POLICY IF EXISTS "operator_zones_self"  ON public.operator_zones;

CREATE POLICY "operator_zones_admin" ON public.operator_zones
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "operator_zones_self" ON public.operator_zones
  FOR SELECT USING (operator_id = auth.uid());

GRANT SELECT ON public.operator_zones TO authenticated;
GRANT ALL    ON public.operator_zones TO service_role;


-- =============================================================================
-- TABLE: cities
-- Mobile app reads active cities (anon OK); admin panel reads all
-- =============================================================================
ALTER TABLE cities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cities_select"    ON cities;
DROP POLICY IF EXISTS "cities_write"     ON cities;
DROP POLICY IF EXISTS "cities_all_admin" ON cities;

CREATE POLICY "cities_select" ON cities FOR SELECT USING (
  (is_active = true AND auth.uid() IS NOT NULL) OR is_admin() OR id = ANY(operator_city_ids())
);
CREATE POLICY "cities_write" ON cities FOR ALL USING (is_admin()) WITH CHECK (is_admin());


-- =============================================================================
-- TABLE: delivery_zones
-- =============================================================================
ALTER TABLE delivery_zones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "delivery_zones_write_admin"       ON delivery_zones;
DROP POLICY IF EXISTS "delivery_zones_select"            ON delivery_zones;
DROP POLICY IF EXISTS "delivery_zones: public read active" ON delivery_zones;

CREATE POLICY "delivery_zones_write_admin" ON delivery_zones
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "delivery_zones_select" ON delivery_zones
  FOR SELECT USING (is_admin() OR id = ANY(operator_zone_ids()));
CREATE POLICY "delivery_zones: public read active" ON delivery_zones
  FOR SELECT USING (is_active = true AND auth.uid() IS NOT NULL);


-- =============================================================================
-- TABLE: menu_items
-- Mobile app reads active items; admin panel reads all
-- =============================================================================
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "menu_items_select"      ON menu_items;
DROP POLICY IF EXISTS "menu_items_write"       ON menu_items;
DROP POLICY IF EXISTS "menu_items_write_admin" ON menu_items;

CREATE POLICY "menu_items_select" ON menu_items FOR SELECT USING (
  (is_global_active = true AND auth.uid() IS NOT NULL) OR is_admin() OR cardinality(operator_zone_ids()) > 0
);
CREATE POLICY "menu_items_write" ON menu_items FOR ALL USING (is_admin()) WITH CHECK (is_admin());


-- =============================================================================
-- TABLE: categories
-- =============================================================================
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "categories_select"      ON categories;
DROP POLICY IF EXISTS "categories_write"       ON categories;
DROP POLICY IF EXISTS "categories_write_admin" ON categories;

CREATE POLICY "categories_select" ON categories FOR SELECT USING (
  (is_active = true AND auth.uid() IS NOT NULL) OR is_admin() OR cardinality(operator_zone_ids()) > 0
);
CREATE POLICY "categories_write" ON categories FOR ALL USING (is_admin()) WITH CHECK (is_admin());


-- =============================================================================
-- TABLE: menu_types
-- =============================================================================
ALTER TABLE menu_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "menu_types_select"      ON menu_types;
DROP POLICY IF EXISTS "menu_types_write_admin" ON menu_types;

CREATE POLICY "menu_types_select"      ON menu_types FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "menu_types_write_admin" ON menu_types FOR ALL    USING (is_admin()) WITH CHECK (is_admin());


-- =============================================================================
-- TABLE: city_menu_items
-- Mobile app reads available items; admin/operators read all for their city
-- NOTE: no qual=true policy — unavailable items are NOT exposed to anon
-- =============================================================================
ALTER TABLE city_menu_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "city_menu_items_select"         ON city_menu_items;
DROP POLICY IF EXISTS "city_menu_items_insert"         ON city_menu_items;
DROP POLICY IF EXISTS "city_menu_items_update"         ON city_menu_items;
DROP POLICY IF EXISTS "city_menu_items_delete"         ON city_menu_items;

CREATE POLICY "city_menu_items_select" ON city_menu_items FOR SELECT USING (
  (is_available = true AND auth.uid() IS NOT NULL) OR is_admin() OR city_id = ANY(operator_city_ids())
);
CREATE POLICY "city_menu_items_insert" ON city_menu_items FOR INSERT WITH CHECK (
  is_admin() OR city_id = ANY(operator_city_ids())
);
CREATE POLICY "city_menu_items_update" ON city_menu_items FOR UPDATE
  USING     (is_admin() OR city_id = ANY(operator_city_ids()))
  WITH CHECK(is_admin() OR city_id = ANY(operator_city_ids()));
CREATE POLICY "city_menu_items_delete" ON city_menu_items FOR DELETE USING (is_admin());


-- =============================================================================
-- TABLE: city_menu_types
-- =============================================================================
ALTER TABLE city_menu_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users read city_menu_types" ON city_menu_types;
DROP POLICY IF EXISTS "Admins write city_menu_types"             ON city_menu_types;

CREATE POLICY "city_menu_types_select" ON city_menu_types FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "city_menu_types_write"  ON city_menu_types FOR ALL    USING (is_admin()) WITH CHECK (is_admin());


-- =============================================================================
-- TABLE: restaurants
-- =============================================================================
ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "restaurants_select" ON restaurants;
DROP POLICY IF EXISTS "restaurants_insert" ON restaurants;
DROP POLICY IF EXISTS "restaurants_update" ON restaurants;
DROP POLICY IF EXISTS "restaurants_delete" ON restaurants;
DROP POLICY IF EXISTS "restaurants_write"  ON restaurants;

CREATE POLICY "restaurants_select" ON restaurants FOR SELECT USING (
  (is_active = true AND auth.uid() IS NOT NULL) OR is_admin() OR city_id = ANY(operator_city_ids())
);
CREATE POLICY "restaurants_insert" ON restaurants FOR INSERT WITH CHECK (
  is_admin() OR city_id = ANY(operator_city_ids())
);
CREATE POLICY "restaurants_update" ON restaurants FOR UPDATE
  USING     (is_admin() OR city_id = ANY(operator_city_ids()))
  WITH CHECK(is_admin() OR city_id = ANY(operator_city_ids()));
CREATE POLICY "restaurants_delete" ON restaurants FOR DELETE USING (is_admin());


-- =============================================================================
-- TABLE: orders
-- =============================================================================
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orders_select" ON orders;
DROP POLICY IF EXISTS "orders_update" ON orders;
DROP POLICY IF EXISTS "orders_insert" ON orders;
DROP POLICY IF EXISTS "orders_delete" ON orders;

CREATE POLICY "orders_select" ON orders FOR SELECT USING (
  auth.uid() = user_id
  OR is_admin()
  OR delivery_zone_id = ANY(operator_zone_ids())
  OR (menu_type = 'frozen' AND EXISTS(
    SELECT 1 FROM operators WHERE id = auth.uid() AND handles_frozen = true
  ))
);

CREATE POLICY "orders_update" ON orders FOR UPDATE USING (
  is_admin()
  OR delivery_zone_id = ANY(operator_zone_ids())
  OR (menu_type = 'frozen' AND EXISTS(
    SELECT 1 FROM operators WHERE id = auth.uid() AND handles_frozen = true
  ))
);

-- Mobile app creates orders via create_order() RPC (SECURITY DEFINER, bypasses RLS).
-- Direct INSERT requires admin, own-zone operator, or frozen operator.
CREATE POLICY "orders_insert" ON orders FOR INSERT WITH CHECK (
  is_admin()
  OR delivery_zone_id = ANY(operator_zone_ids())
  OR (menu_type = 'frozen' AND EXISTS(
    SELECT 1 FROM operators WHERE id = auth.uid() AND handles_frozen = true
  ))
);

CREATE POLICY "orders_delete" ON orders FOR DELETE USING (is_admin());


-- =============================================================================
-- TABLE: order_items
-- =============================================================================
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_items_select"        ON order_items;
DROP POLICY IF EXISTS "order items: user view own" ON order_items;

CREATE POLICY "order_items_select" ON order_items FOR SELECT USING (
  is_admin()
  OR order_id IN (SELECT id FROM orders WHERE delivery_zone_id = ANY(operator_zone_ids()))
  OR order_id IN (SELECT id FROM orders WHERE menu_type = 'frozen' AND EXISTS(
    SELECT 1 FROM operators WHERE id = auth.uid() AND handles_frozen = true
  ))
  OR order_id IN (SELECT id FROM orders WHERE user_id = auth.uid())
);
-- mobile app: user sees own order items (via order ownership)
CREATE POLICY "order items: user view own" ON order_items FOR SELECT USING (
  EXISTS (SELECT 1 FROM orders WHERE orders.id = order_items.order_id AND orders.user_id = auth.uid())
);


-- =============================================================================
-- TABLE: profiles
-- =============================================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select"      ON profiles;
DROP POLICY IF EXISTS "profiles_update_own"  ON profiles;

CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (
  is_admin()
  OR id = auth.uid()
  OR id IN (SELECT DISTINCT user_id FROM orders WHERE delivery_zone_id = ANY(operator_zone_ids()))
  OR id IN (SELECT DISTINCT user_id FROM orders WHERE menu_type = 'frozen' AND EXISTS(
    SELECT 1 FROM operators WHERE id = auth.uid() AND handles_frozen = true
  ))
);

CREATE POLICY "profiles_user_insert" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own"  ON profiles FOR UPDATE
  USING(id = auth.uid() OR is_admin()) WITH CHECK(id = auth.uid() OR is_admin());


-- =============================================================================
-- TABLE: addresses
-- =============================================================================
ALTER TABLE addresses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "addresses_select" ON addresses;
DROP POLICY IF EXISTS "addresses_user"   ON addresses;
DROP POLICY IF EXISTS "addresses_own"    ON addresses;

CREATE POLICY "addresses_select" ON addresses FOR SELECT USING (
  is_admin()
  OR user_id = auth.uid()
  OR user_id IN (
    SELECT DISTINCT user_id FROM orders WHERE delivery_zone_id = ANY(operator_zone_ids())
  )
);
CREATE POLICY "addresses_user" ON addresses FOR ALL
  USING(user_id = auth.uid()) WITH CHECK(user_id = auth.uid());


-- =============================================================================
-- TABLE: promocodes
-- Authenticated users can read active promos; anon cannot
-- =============================================================================
ALTER TABLE promocodes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "promocodes_select" ON promocodes;
DROP POLICY IF EXISTS "promocodes_write"  ON promocodes;

CREATE POLICY "promocodes_select" ON promocodes FOR SELECT USING (
  is_admin()
  OR (is_active = true AND auth.uid() IS NOT NULL)
  OR city_id = ANY(operator_city_ids())
  OR (city_id IS NULL AND auth.uid() IS NOT NULL)
);
CREATE POLICY "promocodes_write" ON promocodes FOR ALL USING (is_admin()) WITH CHECK (is_admin());


-- =============================================================================
-- TABLE: carousel_cards
-- =============================================================================
ALTER TABLE carousel_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "carousel_cards_all_admin"  ON carousel_cards;
DROP POLICY IF EXISTS "carousel_cards_select_all" ON carousel_cards;

CREATE POLICY "carousel_cards_select_all" ON carousel_cards FOR SELECT USING (
  (is_active = true AND auth.uid() IS NOT NULL) OR is_admin()
);
CREATE POLICY "carousel_cards_all_admin"  ON carousel_cards FOR ALL    USING (is_admin()) WITH CHECK (is_admin());


-- =============================================================================
-- TABLE: feedback
-- Anyone (anon) can submit feedback; only admins can read; max 2000 chars
-- =============================================================================
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

ALTER TABLE feedback
  ADD CONSTRAINT IF NOT EXISTS feedback_message_length CHECK (length(message) <= 2000);

DROP POLICY IF EXISTS "anyone can insert feedback" ON feedback;
DROP POLICY IF EXISTS "feedback_select_admin"      ON feedback;

CREATE POLICY "anyone can insert feedback" ON feedback FOR INSERT WITH CHECK (true);
CREATE POLICY "feedback_select_admin"      ON feedback FOR SELECT USING (is_admin());


-- =============================================================================
-- TABLE: audit_log
-- Immutable log; written by SECURITY DEFINER trigger; only admins can read
-- =============================================================================
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_log_select_admin" ON audit_log;
DROP POLICY IF EXISTS "audit_log_insert_deny"  ON audit_log;

CREATE POLICY "audit_log_select_admin" ON audit_log FOR SELECT USING (is_admin());
CREATE POLICY "audit_log_insert_deny"  ON audit_log FOR INSERT WITH CHECK (false);

CREATE OR REPLACE FUNCTION audit_trigger_fn()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO audit_log (user_id, action, table_name, record_id, old_data, new_data)
  VALUES (
    auth.uid(), TG_OP, TG_TABLE_NAME,
    CASE TG_OP WHEN 'DELETE' THEN OLD.id ELSE NEW.id END,
    CASE TG_OP WHEN 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE TG_OP WHEN 'DELETE' THEN NULL ELSE to_jsonb(NEW) END
  );
  RETURN NULL;
END;
$$;


-- =============================================================================
-- STORAGE: dish-photos, carousel-images
-- Reads are public; upload/update restricted to admins only
-- =============================================================================

-- Drop old permissive upload/update policies (duplicates included)
DROP POLICY IF EXISTS "allow upload"               ON storage.objects;
DROP POLICY IF EXISTS "allow upload dish-photos"   ON storage.objects;
DROP POLICY IF EXISTS "allow update"               ON storage.objects;
DROP POLICY IF EXISTS "allow update dish-photos"   ON storage.objects;
DROP POLICY IF EXISTS "allow upload carousel-images"  ON storage.objects;
DROP POLICY IF EXISTS "allow update carousel-images"  ON storage.objects;

CREATE POLICY "admin upload dish-photos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'dish-photos' AND (SELECT public.is_admin()));

CREATE POLICY "admin update dish-photos" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'dish-photos' AND (SELECT public.is_admin()));

CREATE POLICY "admin upload carousel-images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'carousel-images' AND (SELECT public.is_admin()));

CREATE POLICY "admin update carousel-images" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'carousel-images' AND (SELECT public.is_admin()));


-- =============================================================================
-- AUDIT TRIGGER: city_menu_items
-- Price changes per city must be logged (was missing)
-- =============================================================================
DROP TRIGGER IF EXISTS audit_city_menu_items ON public.city_menu_items;
CREATE TRIGGER audit_city_menu_items
  AFTER INSERT OR UPDATE OR DELETE ON public.city_menu_items
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();


-- =============================================================================
-- VERIFY after applying:
-- SELECT tablename, count(*) FROM pg_policies WHERE schemaname='public'
-- GROUP BY tablename ORDER BY count(*) DESC;
-- =============================================================================
