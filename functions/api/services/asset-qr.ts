import { sqlNowStored } from "../_time";

export type AssetQrConfig = {
  assetTable: "pc_assets" | "monitor_assets";
  notFoundMessage: string;
  publicPath: "/public/pc-asset" | "/public/monitor-asset";
};

function genQrKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function mustAssetTable(table: string): asserts table is AssetQrConfig["assetTable"] {
  if (table !== "pc_assets" && table !== "monitor_assets") {
    throw new Error(`unsupported asset table: ${table}`);
  }
}

function normalizeAssetIds(ids: unknown, limit = 500) {
  if (!Array.isArray(ids)) return [] as number[];
  const unique = new Set<number>();
  for (const value of ids) {
    const id = Number(value);
    if (!Number.isFinite(id) || id <= 0) continue;
    unique.add(Math.trunc(id));
    if (unique.size >= limit) break;
  }
  return Array.from(unique);
}

export function buildAssetQrUrl(origin: string, publicPath: AssetQrConfig["publicPath"], id: number, key: string) {
  return `${origin}${publicPath}?id=${encodeURIComponent(String(id))}&key=${encodeURIComponent(key)}`;
}

export async function getOrCreateAssetQr(db: D1Database, config: AssetQrConfig, id: number, origin: string) {
  mustAssetTable(config.assetTable);
  if (!Number.isFinite(id) || id <= 0) {
    throw Object.assign(new Error("缺少资产ID"), { status: 400 });
  }

  const row = await db.prepare(`SELECT id, qr_key FROM ${config.assetTable} WHERE id=?`).bind(id).first<any>();
  if (!row) {
    throw Object.assign(new Error(config.notFoundMessage), { status: 404 });
  }

  let key = String(row.qr_key || "").trim();
  if (!key) {
    key = genQrKey();
    await db
      .prepare(`UPDATE ${config.assetTable} SET qr_key=?, qr_updated_at=${sqlNowStored()}, updated_at=${sqlNowStored()} WHERE id=?`)
      .bind(key, id)
      .run();
  }

  return {
    id,
    key,
    url: buildAssetQrUrl(origin, config.publicPath, id, key),
  };
}

export async function resetAssetQr(db: D1Database, config: AssetQrConfig, id: number, origin: string) {
  mustAssetTable(config.assetTable);
  if (!Number.isFinite(id) || id <= 0) {
    throw Object.assign(new Error("缺少资产ID"), { status: 400 });
  }

  const row = await db.prepare(`SELECT id FROM ${config.assetTable} WHERE id=?`).bind(id).first<any>();
  if (!row) {
    throw Object.assign(new Error(config.notFoundMessage), { status: 404 });
  }

  const key = genQrKey();
  await db
    .prepare(`UPDATE ${config.assetTable} SET qr_key=?, qr_updated_at=${sqlNowStored()}, updated_at=${sqlNowStored()} WHERE id=?`)
    .bind(key, id)
    .run();

  return {
    id,
    key,
    url: buildAssetQrUrl(origin, config.publicPath, id, key),
  };
}

export async function initMissingAssetQrKeys(db: D1Database, config: AssetQrConfig, batchSize: number) {
  mustAssetTable(config.assetTable);
  const batch = Math.max(1, Math.min(500, Math.trunc(batchSize || 0) || 50));

  const rows = await db
    .prepare(`SELECT id FROM ${config.assetTable} WHERE qr_key IS NULL OR TRIM(qr_key)='' ORDER BY id ASC LIMIT ?`)
    .bind(batch)
    .all<any>();

  const ids = (rows.results || []).map((row: any) => Number(row.id)).filter((id: number) => id > 0);
  if (!ids.length) return { updated: 0 };

  const stmts: D1PreparedStatement[] = [];
  for (const id of ids) {
    stmts.push(
      db
        .prepare(`UPDATE ${config.assetTable} SET qr_key=?, qr_updated_at=${sqlNowStored()}, updated_at=${sqlNowStored()} WHERE id=? AND (qr_key IS NULL OR TRIM(qr_key)='')`)
        .bind(genQrKey(), id)
    );
  }
  await db.batch(stmts);
  return { updated: ids.length };
}

export async function getOrCreateAssetQrBulk(db: D1Database, config: AssetQrConfig, ids: unknown, origin: string) {
  mustAssetTable(config.assetTable);
  const normalizedIds = normalizeAssetIds(ids);
  if (!normalizedIds.length) {
    throw Object.assign(new Error('请至少传入一个资产ID'), { status: 400 });
  }

  const placeholders = normalizedIds.map(() => '?').join(',');
  const result = await db
    .prepare(`SELECT id, qr_key FROM ${config.assetTable} WHERE id IN (${placeholders})`)
    .bind(...normalizedIds)
    .all<any>();

  const keyMap = new Map<number, string>();
  for (const row of result.results || []) {
    keyMap.set(Number(row.id), String(row.qr_key || '').trim());
  }

  const updates: D1PreparedStatement[] = [];
  for (const id of normalizedIds) {
    if (!keyMap.has(id)) continue;
    if (keyMap.get(id)) continue;
    const key = genQrKey();
    keyMap.set(id, key);
    updates.push(
      db
        .prepare(`UPDATE ${config.assetTable} SET qr_key=?, qr_updated_at=${sqlNowStored()}, updated_at=${sqlNowStored()} WHERE id=? AND (qr_key IS NULL OR TRIM(qr_key)='')`)
        .bind(key, id)
    );
  }
  if (updates.length) await db.batch(updates);

  return normalizedIds
    .filter((id) => keyMap.has(id))
    .map((id) => ({
      id,
      key: keyMap.get(id) || '',
      url: buildAssetQrUrl(origin, config.publicPath, id, keyMap.get(id) || ''),
    }))
    .filter((item) => item.key && item.url);
}
