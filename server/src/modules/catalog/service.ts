import type { Product } from "@checkout/shared";
import { pool, query, type Queryable } from "../../db.js";
import { errors } from "../../errors.js";

export const FEATURED_SKU = "SONY-WH-1000";

interface SkuRow {
  id: string;
  sku: string;
  name: string;
  description: string;
  image_url: string;
  currency: string;
  unit_price_minor: number;
  stock: number;
  low_stock_threshold: number;
  max_quantity: number;
  active: boolean;
}

export function mapProduct(row: SkuRow): Product {
  return {
    sku: row.sku,
    name: row.name,
    description: row.description,
    imageUrl: row.image_url,
    unitPriceMinor: row.unit_price_minor,
    currency: row.currency,
    available: row.active && row.stock > 0,
    availableQuantity: row.stock,
    maxQuantity: Math.min(row.max_quantity, row.stock),
  };
}

export async function getFeaturedProduct(client: Queryable = pool): Promise<Product> {
  const result = await query<SkuRow>(
    `SELECT s.id, s.sku, s.currency, s.unit_price_minor, s.stock, s.low_stock_threshold, s.max_quantity,
            p.name, p.description, p.image_url, p.active
       FROM skus s JOIN products p ON p.id = s.product_id
      WHERE s.sku = $1 AND p.active`,
    [FEATURED_SKU],
    client,
  );
  const row = result.rows[0];
  if (!row) throw errors.notFound("Product is unavailable.");
  return mapProduct(row);
}

export async function getSku(sku: string, client: Queryable, forUpdate = false): Promise<SkuRow> {
  const result = await query<SkuRow>(
    `SELECT s.id, s.sku, s.currency, s.unit_price_minor, s.stock, s.low_stock_threshold, s.max_quantity,
            p.name, p.description, p.image_url, p.active
       FROM skus s JOIN products p ON p.id = s.product_id
      WHERE s.sku = $1 ${forUpdate ? "FOR UPDATE OF s" : ""}`,
    [sku],
    client,
  );
  const row = result.rows[0];
  if (!row) throw errors.notFound("Product is unavailable.");
  return row;
}
