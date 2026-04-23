-- Add YooKassa credentials per delivery zone
ALTER TABLE delivery_zones
  ADD COLUMN IF NOT EXISTS yookassa_shop_id TEXT,
  ADD COLUMN IF NOT EXISTS yookassa_secret_key TEXT;
