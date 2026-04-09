import { sqlNowStored } from '../_time';

let ensured = false;
let ensuring: Promise<void> | null = null;

export function normalizeCategoryName(value: unknown) {
  const text = String(value ?? '').trim();
  return text || null;
}

export async function ensureItemCategorySchema(db: D1Database) {
  if (ensured) return;
  if (ensuring) return ensuring;
  ensuring = (async () => {
    await db.prepare(
      `CREATE TABLE IF NOT EXISTS item_categories (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         name TEXT NOT NULL UNIQUE,
         enabled INTEGER NOT NULL DEFAULT 1,
         created_at TEXT NOT NULL DEFAULT (${sqlNowStored()}),
         updated_at TEXT NOT NULL DEFAULT (${sqlNowStored()})
       )`
    ).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_item_categories_enabled_name ON item_categories(enabled, name)`).run();
    try {
      await db.prepare(`ALTER TABLE items ADD COLUMN category_id INTEGER REFERENCES item_categories(id)`).run();
    } catch {}
    await db.prepare(
      `INSERT OR IGNORE INTO item_categories (name, enabled, created_at, updated_at)
       SELECT DISTINCT TRIM(category), 1, ${sqlNowStored()}, ${sqlNowStored()}
       FROM items
       WHERE category IS NOT NULL AND TRIM(category)<>''`
    ).run().catch(() => {});
    await db.prepare(
      `UPDATE items
       SET category_id = (
         SELECT c.id FROM item_categories c WHERE c.name = TRIM(items.category) LIMIT 1
       )
       WHERE category IS NOT NULL AND TRIM(category)<>'' AND category_id IS NULL`
    ).run().catch(() => {});
    ensured = true;
  })().finally(() => {
    ensuring = null;
  });
  return ensuring;
}

export async function resolveItemCategory(db: D1Database, categoryName: unknown) {
  await ensureItemCategorySchema(db);
  const normalized = normalizeCategoryName(categoryName);
  if (!normalized) return { id: null as number | null, name: null as string | null };
  const existing = await db.prepare(`SELECT id, name FROM item_categories WHERE name=? LIMIT 1`).bind(normalized).first<any>();
  if (existing?.id) return { id: Number(existing.id) || null, name: String(existing.name || normalized) };
  const ins = await db.prepare(
    `INSERT INTO item_categories (name, enabled, created_at, updated_at)
     VALUES (?, 1, ${sqlNowStored()}, ${sqlNowStored()})`
  ).bind(normalized).run();
  const id = Number((ins as any)?.meta?.last_row_id || 0) || null;
  if (id) return { id, name: normalized };
  const row = await db.prepare(`SELECT id, name FROM item_categories WHERE name=? LIMIT 1`).bind(normalized).first<any>();
  return { id: row?.id ? Number(row.id) : null, name: row?.name ? String(row.name) : normalized };
}

export async function listItemCategories(db: D1Database) {
  await ensureItemCategorySchema(db);
  const { results } = await db.prepare(
    `SELECT id, name
     FROM item_categories
     WHERE enabled=1
     ORDER BY name COLLATE NOCASE ASC, id ASC`
  ).all<any>();
  return (results || []).map((row) => ({ id: Number(row?.id || 0) || 0, name: String(row?.name || '') }));
}
