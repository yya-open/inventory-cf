import { SQL_STORED_NOW_DEFAULT, sqlNowStored } from '../_time';

export type ItemSkuMatch = {
  input_sku: string;
  id: number;
  sku: string;
  matched_by: 'sku' | 'alias';
  enabled?: number;
};

export async function ensureItemSkuAliasSchema(db: D1Database) {
  await db.batch([
    db.prepare(
      `CREATE TABLE IF NOT EXISTS item_sku_aliases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_id INTEGER NOT NULL,
        alias_sku TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT ${SQL_STORED_NOW_DEFAULT},
        created_by TEXT,
        note TEXT,
        FOREIGN KEY(item_id) REFERENCES items(id)
      )`
    ),
    db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_item_sku_aliases_alias_active ON item_sku_aliases(alias_sku) WHERE active=1`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_item_sku_aliases_item_active ON item_sku_aliases(item_id, active)`),
  ]);
}

export async function resolveItemsBySkuOrAlias(db: D1Database, skus: string[], options: { includeDisabledDirect?: boolean } = {}) {
  const normalized = Array.from(new Set((Array.isArray(skus) ? skus : [])
    .map((sku) => String(sku || '').trim())
    .filter(Boolean)));
  const map = new Map<string, ItemSkuMatch>();
  if (!normalized.length) return map;

  const ph = normalized.map(() => '?').join(',');
  const directRows = (await db.prepare(
    `SELECT sku AS input_sku, id, sku, enabled, 'sku' AS matched_by
       FROM items
      WHERE ${options.includeDisabledDirect ? '' : 'enabled=1 AND '}sku IN (${ph})`
  ).bind(...normalized).all<any>()).results || [];
  for (const row of directRows as any[]) {
    const input = String(row.input_sku || '').trim();
    if (!input) continue;
    map.set(input, {
      input_sku: input,
      id: Number(row.id),
      sku: String(row.sku || ''),
      matched_by: 'sku',
      enabled: Number(row.enabled ?? 1),
    });
  }

  try {
    await ensureItemSkuAliasSchema(db);
    const aliasRows = (await db.prepare(
      `SELECT a.alias_sku AS input_sku, i.id, i.sku, 'alias' AS matched_by
         FROM item_sku_aliases a
         JOIN items i ON i.id=a.item_id
        WHERE a.active=1
          AND i.enabled=1
          AND a.alias_sku IN (${ph})`
    ).bind(...normalized).all<any>()).results || [];
    for (const row of aliasRows as any[]) {
      const input = String(row.input_sku || '').trim();
      if (!input || map.has(input)) continue;
      map.set(input, {
        input_sku: input,
        id: Number(row.id),
        sku: String(row.sku || ''),
        matched_by: 'alias',
      });
    }
  } catch {
    // Older databases without the alias table still support direct SKU matching.
  }

  return map;
}

export function aliasInsertStatement(db: D1Database, input: { item_id: number; alias_sku: string; created_by?: string | null; note?: string | null }) {
  return db.prepare(
    `INSERT INTO item_sku_aliases (item_id, alias_sku, active, created_at, created_by, note)
     VALUES (?, ?, 1, ${sqlNowStored()}, ?, ?)`
  ).bind(input.item_id, input.alias_sku, input.created_by || null, input.note || null);
}
