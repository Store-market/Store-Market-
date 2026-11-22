-- Apply this migration file (migrations/0001_initial.sql) to the Cloudflare D1 database once.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE, name TEXT NOT NULL,
 password_hash TEXT NOT NULL, password_salt TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('customer','seller','owner')),
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','pending','suspended')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sessions (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS products (
 id TEXT PRIMARY KEY, seller_id TEXT NOT NULL REFERENCES users(id), name TEXT NOT NULL,
 description TEXT NOT NULL DEFAULT '', category TEXT NOT NULL,
 price_dzd INTEGER NOT NULL CHECK(price_dzd >= 0), stock INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0),
 image_url TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','rejected')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE TABLE IF NOT EXISTS orders (
 id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES users(id), customer_name TEXT NOT NULL,
 phone TEXT NOT NULL, wilaya TEXT NOT NULL, address TEXT NOT NULL,
 payment_method TEXT NOT NULL DEFAULT 'cod_demo' CHECK(payment_method = 'cod_demo'),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','shipped','delivered','cancelled')),
 total_dzd INTEGER NOT NULL CHECK(total_dzd >= 0), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS order_items (
 id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
 product_id TEXT NOT NULL REFERENCES products(id), seller_id TEXT NOT NULL REFERENCES users(id),
 product_name TEXT NOT NULL, unit_price_dzd INTEGER NOT NULL, quantity INTEGER NOT NULL CHECK(quantity > 0)
);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_order_items_seller ON order_items(seller_id);

-- Enforce stock checks inside the same D1 batch transaction to prevent overselling.
CREATE TRIGGER IF NOT EXISTS order_item_stock_guard
BEFORE INSERT ON order_items
BEGIN
  SELECT CASE
    WHEN (SELECT stock FROM products WHERE id=NEW.product_id) IS NULL
      THEN RAISE(ABORT, 'product_not_found')
    WHEN (SELECT stock FROM products WHERE id=NEW.product_id) < NEW.quantity
      THEN RAISE(ABORT, 'insufficient_stock')
  END;
END;
CREATE TRIGGER IF NOT EXISTS order_item_decrement_stock
AFTER INSERT ON order_items
BEGIN
  UPDATE products SET stock=stock-NEW.quantity WHERE id=NEW.product_id;
END;
