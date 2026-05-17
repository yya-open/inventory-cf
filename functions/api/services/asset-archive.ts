import {
  monitorAssetArchiveSql,
  monitorAssetRestoreSql,
  pcAssetArchiveSql,
  pcAssetRestoreSql,
} from './asset-ledger';

export type AssetArchiveKind = 'pc' | 'monitor';

export type AssetRelationSummary = Record<string, number> & {
  related_total: number;
};

type AssetArchiveConfig = {
  kind: AssetArchiveKind;
  assetTable: 'pc_assets' | 'monitor_assets';
  archiveSql: () => string;
  restoreSql: () => string;
  relationKeys: Array<{ key: string; table: string; countsAsHistory?: boolean }>;
};

const CONFIG: Record<AssetArchiveKind, AssetArchiveConfig> = {
  pc: {
    kind: 'pc',
    assetTable: 'pc_assets',
    archiveSql: pcAssetArchiveSql,
    restoreSql: pcAssetRestoreSql,
    relationKeys: [
      { key: 'in_count', table: 'pc_in' },
      { key: 'out_count', table: 'pc_out', countsAsHistory: true },
      { key: 'recycle_count', table: 'pc_recycle', countsAsHistory: true },
      { key: 'scrap_count', table: 'pc_scrap', countsAsHistory: true },
      { key: 'inventory_log_count', table: 'pc_inventory_log', countsAsHistory: true },
    ],
  },
  monitor: {
    kind: 'monitor',
    assetTable: 'monitor_assets',
    archiveSql: monitorAssetArchiveSql,
    restoreSql: monitorAssetRestoreSql,
    relationKeys: [
      { key: 'tx_count', table: 'monitor_tx', countsAsHistory: true },
      { key: 'inventory_log_count', table: 'monitor_inventory_log', countsAsHistory: true },
    ],
  },
};

function configOf(kind: AssetArchiveKind) {
  return CONFIG[kind];
}

export async function getAssetById(db: D1Database, kind: AssetArchiveKind, id: number) {
  const config = configOf(kind);
  return db.prepare(`SELECT * FROM ${config.assetTable} WHERE id=?`).bind(id).first<any>();
}

export async function getRelatedRecordCounts(db: D1Database, kind: AssetArchiveKind, id: number): Promise<Record<string, number>> {
  const config = configOf(kind);
  const selectSql = config.relationKeys
    .map(({ key, table }) => `(SELECT COUNT(*) FROM ${table} WHERE asset_id=?) AS ${key}`)
    .join(',\n        ');
  const binds = config.relationKeys.map(() => id);
  const row = await db.prepare(`SELECT\n        ${selectSql}\n    `).bind(...binds).first<any>();
  return config.relationKeys.reduce((acc, item) => {
    acc[item.key] = Number(row?.[item.key] || 0);
    return acc;
  }, {} as Record<string, number>);
}

export function hasRelatedHistory(kind: AssetArchiveKind, counts: Record<string, number>) {
  const config = configOf(kind);
  return config.relationKeys.some((item) => item.countsAsHistory && Number(counts[item.key] || 0) > 0);
}

export async function archiveAsset(db: D1Database, kind: AssetArchiveKind, id: number, updatedBy: string | null, reason: string, note: string | null = null) {
  const config = configOf(kind);
  await db.prepare(config.archiveSql()).bind(reason, note, updatedBy || null, id).run();
}

export async function restoreAsset(db: D1Database, kind: AssetArchiveKind, id: number) {
  const config = configOf(kind);
  await db.prepare(config.restoreSql()).bind(id).run();
}

function buildCascadeMigrationHintError(kind: AssetArchiveKind) {
  const label = kind === 'pc' ? '电脑' : '显示器';
  return Object.assign(new Error(`${label}台账删除依赖最新外键级联迁移，请先执行最新 migrate 后再重试`), { status: 500 });
}

export async function deleteAssetRow(db: D1Database, kind: AssetArchiveKind, id: number) {
  const config = configOf(kind);
  try {
    await db.prepare(`DELETE FROM ${config.assetTable} WHERE id=?`).bind(id).run();
  } catch (error: any) {
    const message = String(error?.message || error || '');
    if (/foreign key|constraint/i.test(message)) throw buildCascadeMigrationHintError(kind);
    throw error;
  }
}

export async function purgeArchivedAsset(db: D1Database, kind: AssetArchiveKind, id: number): Promise<AssetRelationSummary> {
  const counts = await getRelatedRecordCounts(db, kind, id);
  await deleteAssetRow(db, kind, id);
  const related_total = Object.values(counts).reduce((sum, value) => sum + Number(value || 0), 0);
  return { ...counts, related_total };
}
