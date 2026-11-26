import type { Cart } from "@checkout/shared";
import { pool, query, withTransaction, type Queryable } from "../../db.js";
import { errors } from "../../errors.js";
import { getSku, FEATURED_SKU } from "../catalog/service.js";

interface CartRow { id: string; currency: string }

export async function ensureCart(
  customerId: string,
  client: Queryable = pool,
  currency = "GBP",
): Promise<CartRow> {
  const existing = await query<CartRow>(
    `SELECT id, currency FROM carts WHERE customer_id = $1 AND status = 'active'`,
    [customerId],
    client,
  );
  if (existing.rows[0]) return existing.rows[0];
  const created = await query<CartRow>(
    `INSERT INTO carts (customer_id, currency) VALUES ($1, $2)
     ON CONFLICT (customer_id) WHERE status = 'active' DO NOTHING
     RETURNING id, currency`,
    [customerId, currency],
    client,
  );
  if (created.rows[0]) return created.rows[0];
  const raced = await query<CartRow>(
    "SELECT id, currency FROM carts WHERE customer_id = $1 AND status = 'active'",
    [customerId],
    client,
  );
  if (!raced.rows[0]) throw errors.internal();
  return raced.rows[0];
}

export async function getCart(customerId: string, client: Queryable = pool): Promise<Cart> {
  const cart = await ensureCart(customerId, client);
  const items = await query<{
    sku: string; name: string; quantity: number; unit_price_minor: number; stock: number;
  }>(
    `SELECT s.sku, p.name, ci.quantity, s.unit_price_minor, s.stock
       FROM cart_items ci
       JOIN skus s ON s.id = ci.sku_id
       JOIN products p ON p.id = s.product_id
      WHERE ci.cart_id = $1
      ORDER BY ci.created_at`,
    [cart.id],
    client,
  );
  return {
    id: cart.id,
    currency: cart.currency.trim(),
    items: items.rows.map((row) => ({
      sku: row.sku,
      name: row.name,
      quantity: row.quantity,
      unitPriceMinor: row.unit_price_minor,
      available: row.stock >= row.quantity,
    })),
  };
}

export async function setQuantity(
  customerId: string,
  sku: string,
  quantity: number,
): Promise<Cart> {
  return withTransaction(async (client) => {
    const cart = await ensureCart(customerId, client);
    const productSku = await getSku(sku, client, true);
    if (!productSku.active) throw errors.inventoryChanged();
    const available = productSku.stock;
    const capped = Math.min(quantity, productSku.max_quantity, Math.max(0, available));
    if (quantity > productSku.max_quantity) {
      throw errors.validation(`Maximum quantity is ${productSku.max_quantity}.`, "quantity");
    }
    if (quantity > available) throw errors.inventoryChanged();

    if (capped <= 0) {
      await query("DELETE FROM cart_items WHERE cart_id = $1 AND sku_id = $2", [cart.id, productSku.id], client);
    } else {
      await query(
        `INSERT INTO cart_items (cart_id, sku_id, quantity) VALUES ($1, $2, $3)
         ON CONFLICT (cart_id, sku_id) DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = now()`,
        [cart.id, productSku.id, capped],
        client,
      );
    }
    await query("UPDATE carts SET updated_at = now() WHERE id = $1", [cart.id], client);
    return getCart(customerId, client);
  });
}

export async function addDefaultItem(customerId: string, client: Queryable = pool): Promise<void> {
  const cart = await ensureCart(customerId, client);
  const sku = await getSku(FEATURED_SKU, client);
  await query(
    `INSERT INTO cart_items (cart_id, sku_id, quantity) VALUES ($1, $2, 1)
     ON CONFLICT (cart_id, sku_id) DO NOTHING`,
    [cart.id, sku.id],
    client,
  );
}

// After checkout the previous cart is marked ordered/abandoned. Bootstrap must
// create a fresh starter cart, but an intentionally emptied active cart is left
// alone.
export async function ensureStarterCart(customerId: string, client: Queryable = pool): Promise<void> {
  const active = await query(
    "SELECT id FROM carts WHERE customer_id = $1 AND status = 'active'",
    [customerId],
    client,
  );
  if (!active.rows[0]) await addDefaultItem(customerId, client);
}

export async function mergeGuestCart(guestCustomerId: string, targetCustomerId: string, client: Queryable): Promise<void> {
  if (guestCustomerId === targetCustomerId) return;
  const guestCart = await query<{ id: string }>(
    "SELECT id FROM carts WHERE customer_id = $1 AND status = 'active'",
    [guestCustomerId],
    client,
  );
  const guestCartId = guestCart.rows[0]?.id;
  if (!guestCartId) return;

  const targetCart = await ensureCart(targetCustomerId, client);
  const items = await query<{ sku_id: string; quantity: number }>(
    "SELECT sku_id, quantity FROM cart_items WHERE cart_id = $1",
    [guestCartId],
    client,
  );
  for (const item of items.rows) {
    const existing = await query<{ id: string; quantity: number }>(
      "SELECT id, quantity FROM cart_items WHERE cart_id = $1 AND sku_id = $2",
      [targetCart.id, item.sku_id],
      client,
    );
    const sku = await query<{ stock: number; max_quantity: number }>(
      "SELECT stock, max_quantity FROM skus WHERE id = $1 FOR UPDATE",
      [item.sku_id],
      client,
    );
    const limit = Math.min(sku.rows[0]?.max_quantity ?? 10, sku.rows[0]?.stock ?? 0);
    const quantity = Math.min(limit, (existing.rows[0]?.quantity ?? 0) + item.quantity);
    if (quantity <= 0) continue;
    if (existing.rows[0]) {
      await query("UPDATE cart_items SET quantity = $1, updated_at = now() WHERE id = $2", [quantity, existing.rows[0].id], client);
    } else {
      await query("INSERT INTO cart_items (cart_id, sku_id, quantity) VALUES ($1, $2, $3)", [targetCart.id, item.sku_id, quantity], client);
    }
  }
  await query("UPDATE carts SET status = 'abandoned', updated_at = now() WHERE id = $1", [guestCartId], client);
}

export async function markCartOrdered(cartId: string, client: Queryable): Promise<void> {
  await query("UPDATE carts SET status = 'ordered', updated_at = now() WHERE id = $1", [cartId], client);
}
