-- =============================================================================
-- delivery_zones: security hardening
-- Apply in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- Idempotent — safe to run multiple times.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. updated_at column + auto-update trigger
--    Uses the existing fn_update_updated_at() function (same as all other tables).
-- -----------------------------------------------------------------------------
ALTER TABLE delivery_zones
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now() NOT NULL;

DROP TRIGGER IF EXISTS delivery_zones_updated_at ON delivery_zones;
CREATE TRIGGER delivery_zones_updated_at
  BEFORE UPDATE ON delivery_zones
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();


-- -----------------------------------------------------------------------------
-- 2. CHECK constraints — prevent invalid monetary values
-- -----------------------------------------------------------------------------
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


-- -----------------------------------------------------------------------------
-- 3. RLS policies
--
-- Before:
--   "delivery_zones: admin all"  → fn_is_admin() ALL, no explicit WITH CHECK
--   "delivery_zones: public read active" → (is_active = true) SELECT
--
-- After:
--   delivery_zones_write_admin   → is_admin() ALL with explicit WITH CHECK
--   delivery_zones_select        → is_admin() OR city_id = operator_city_id() SELECT
--   "delivery_zones: public read active" → (is_active = true) SELECT (unchanged)
-- -----------------------------------------------------------------------------

-- Remove old policy: used fn_is_admin() (legacy function name), no WITH CHECK clause
DROP POLICY IF EXISTS "delivery_zones: admin all" ON delivery_zones;

-- Superadmin: full CRUD — WITH CHECK prevents admin from writing rows
-- where is_admin() would return false (extra guard on INSERT/UPDATE)
DROP POLICY IF EXISTS "delivery_zones_write_admin" ON delivery_zones;
CREATE POLICY "delivery_zones_write_admin" ON delivery_zones
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- Authenticated operators: SELECT city-scoped, including inactive zones.
-- Needed so the admin panel can show all zones (active + inactive) for a city.
-- Public policy below still covers anon SELECT for is_active=true rows.
DROP POLICY IF EXISTS "delivery_zones_select" ON delivery_zones;
CREATE POLICY "delivery_zones_select" ON delivery_zones
  FOR SELECT USING (
    is_admin()
    OR city_id = operator_city_id()
  );

-- Public / mobile app: active zones readable without auth.
-- Recreated explicitly so it uses the same is_admin()-style naming going forward.
DROP POLICY IF EXISTS "delivery_zones: public read active" ON delivery_zones;
CREATE POLICY "delivery_zones: public read active" ON delivery_zones
  FOR SELECT USING (is_active = true);


-- -----------------------------------------------------------------------------
-- 4. Audit trigger
--    Logs INSERT / UPDATE / DELETE to audit_log via SECURITY DEFINER function.
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS audit_delivery_zones ON delivery_zones;
CREATE TRIGGER audit_delivery_zones
  AFTER INSERT OR UPDATE OR DELETE ON delivery_zones
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();


-- -----------------------------------------------------------------------------
-- 5. Verification queries — run after applying to confirm state
-- -----------------------------------------------------------------------------

-- 5a. Confirm columns
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'delivery_zones'
-- ORDER BY ordinal_position;

-- 5b. Confirm policies
-- SELECT policyname, cmd, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'delivery_zones'
-- ORDER BY policyname;

-- 5c. Confirm triggers
-- SELECT trigger_name, event_manipulation, action_statement
-- FROM information_schema.triggers
-- WHERE event_object_schema = 'public' AND event_object_table = 'delivery_zones';

-- 5d. Confirm CHECK constraints
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid = 'public.delivery_zones'::regclass AND contype = 'c';
