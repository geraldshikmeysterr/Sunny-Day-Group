-- ============================================================
-- MIGRATION: frozen_global
-- Заморозка доступна из любой точки, независимо от города.
-- Применить через Supabase SQL Editor.
-- ============================================================

-- 1. menu_types: флаг «глобальный» + стоимость доставки
ALTER TABLE menu_types
  ADD COLUMN IF NOT EXISTS is_global     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS delivery_fee  numeric NOT NULL DEFAULT 0;

UPDATE menu_types SET is_global = true WHERE slug = 'frozen';

-- 2. menu_items: глобальная цена (для позиций глобального типа)
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS global_price numeric;

-- 3. orders: city_id nullable — заказы заморозки не привязаны к городу
ALTER TABLE orders ALTER COLUMN city_id DROP NOT NULL;

-- 4. operators: флаг «обрабатывает заморозку»
ALTER TABLE operators ADD COLUMN IF NOT EXISTS handles_frozen boolean NOT NULL DEFAULT false;

-- ============================================================
-- RLS: orders
-- ============================================================
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

DROP POLICY IF EXISTS "orders_insert" ON orders;
CREATE POLICY "orders_insert" ON orders FOR INSERT WITH CHECK (
  is_admin()
  OR delivery_zone_id = ANY(operator_zone_ids())
  OR menu_type = 'frozen'
);

-- ============================================================
-- RLS: order_items
-- ============================================================
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

-- ============================================================
-- RLS: profiles (клиенты, сделавшие заказ заморозки)
-- ============================================================
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
