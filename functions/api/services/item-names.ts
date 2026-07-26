export type ItemNameMatch = {
  id: number;
  sku: string;
  name: string;
};

export async function resolveItemsByName(db: D1Database, names: string[]) {
  const normalized = Array.from(new Set((Array.isArray(names) ? names : [])
    .map((name) => String(name || '').trim())
    .filter(Boolean)));
  const matches = new Map<string, ItemNameMatch[]>();
  if (!normalized.length) return matches;

  const placeholders = normalized.map(() => '?').join(',');
  const rows = (await db.prepare(
    `SELECT id, sku, name
       FROM items
      WHERE enabled=1 AND name IN (${placeholders})`
  ).bind(...normalized).all<any>()).results || [];

  for (const row of rows as any[]) {
    const name = String(row.name || '').trim();
    if (!name) continue;
    const current = matches.get(name) || [];
    current.push({ id: Number(row.id), sku: String(row.sku || ''), name });
    matches.set(name, current);
  }

  return matches;
}
