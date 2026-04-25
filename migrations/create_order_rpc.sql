-- Safe order creation via server-side RPC.
-- Prices are read from city_menu_items on the server — the client
-- sends only item IDs and quantities, never prices or totals.
--
-- Direct INSERT on orders/order_items from mobile clients is removed
-- so this function is the only path to create an order.

-- ----------------------------------------------------------------
-- 1. Remove direct-insert policies that allowed price manipulation
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "orders: user insert own"               ON public.orders;
DROP POLICY IF EXISTS "order_items: user insert to own new order" ON public.order_items;

-- ----------------------------------------------------------------
-- 2. RPC function
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_order(
  p_city_id          UUID,
  p_delivery_zone_id UUID,
  p_address_id       UUID,        -- nullable (pickup / no address)
  p_menu_type        TEXT,
  p_comment          TEXT    DEFAULT NULL,
  p_items            JSONB   DEFAULT '[]'::JSONB  -- [{menu_item_id, quantity}]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id          UUID    := auth.uid();
  v_order_id         UUID;
  v_zone             RECORD;
  v_items_total      NUMERIC := 0;
  v_delivery_fee     NUMERIC;
  v_item             JSONB;
  v_menu_item_id     UUID;
  v_quantity         INT;
  v_price            NUMERIC;
  v_item_name        TEXT;
  v_is_available     BOOLEAN;
  v_is_global_active BOOLEAN;
BEGIN
  -- 1. Must be authenticated
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- 2. Cart must not be empty
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Корзина пустая';
  END IF;

  -- 3. Delivery zone must belong to the city and be active
  SELECT delivery_fee, free_from, min_order, yookassa_shop_id
  INTO v_zone
  FROM delivery_zones
  WHERE id = p_delivery_zone_id
    AND city_id = p_city_id
    AND is_active = TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Зона доставки не найдена или недоступна';
  END IF;

  -- 4. Address (if provided) must belong to this user
  IF p_address_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM addresses WHERE id = p_address_id AND user_id = v_user_id
    ) THEN
      RAISE EXCEPTION 'Адрес не найден';
    END IF;
  END IF;

  -- 5. Validate each item and accumulate total using server-side prices
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_menu_item_id := (v_item->>'menu_item_id')::UUID;
    v_quantity     := (v_item->>'quantity')::INT;

    IF v_quantity IS NULL OR v_quantity < 1 THEN
      RAISE EXCEPTION 'Некорректное количество для позиции %', v_menu_item_id;
    END IF;

    SELECT cmi.price, cmi.is_available, mi.name, mi.is_global_active
    INTO   v_price, v_is_available, v_item_name, v_is_global_active
    FROM   city_menu_items cmi
    JOIN   menu_items mi ON mi.id = cmi.menu_item_id
    WHERE  cmi.menu_item_id = v_menu_item_id
      AND  cmi.city_id = p_city_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Позиция % недоступна в этом городе', v_menu_item_id;
    END IF;

    IF NOT v_is_available OR NOT v_is_global_active THEN
      RAISE EXCEPTION 'Позиция «%» недоступна для заказа', v_item_name;
    END IF;

    v_items_total := v_items_total + (v_price * v_quantity);
  END LOOP;

  -- 6. Check minimum order amount
  IF v_items_total < v_zone.min_order THEN
    RAISE EXCEPTION 'Минимальная сумма заказа — % ₽', v_zone.min_order;
  END IF;

  -- 7. Apply free delivery threshold
  v_delivery_fee := CASE
    WHEN v_zone.free_from IS NOT NULL AND v_items_total >= v_zone.free_from THEN 0
    ELSE v_zone.delivery_fee
  END;

  -- 8. Create the order (yookassa_shop_id copied from the zone)
  INSERT INTO orders (
    user_id, city_id, delivery_zone_id, address_id,
    menu_type, comment,
    total_amount, delivery_fee,
    yookassa_shop_id,
    status, payment_status
  ) VALUES (
    v_user_id, p_city_id, p_delivery_zone_id, p_address_id,
    p_menu_type, p_comment,
    v_items_total + v_delivery_fee, v_delivery_fee,
    v_zone.yookassa_shop_id,
    'new', 'pending'
  )
  RETURNING id INTO v_order_id;

  -- 9. Insert order items with server-side prices
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_menu_item_id := (v_item->>'menu_item_id')::UUID;
    v_quantity     := (v_item->>'quantity')::INT;

    SELECT cmi.price, mi.name
    INTO   v_price, v_item_name
    FROM   city_menu_items cmi
    JOIN   menu_items mi ON mi.id = cmi.menu_item_id
    WHERE  cmi.menu_item_id = v_menu_item_id
      AND  cmi.city_id = p_city_id;

    INSERT INTO order_items (order_id, menu_item_id, item_name, item_price, quantity, subtotal)
    VALUES (v_order_id, v_menu_item_id, v_item_name, v_price, v_quantity, v_price * v_quantity);
  END LOOP;

  RETURN v_order_id;
END;
$$;

-- Only authenticated users (mobile clients) can call this function
REVOKE ALL ON FUNCTION public.create_order FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_order TO authenticated;
