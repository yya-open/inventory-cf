import {
  archiveAsset,
  deleteAssetRow,
  getRelatedRecordCounts,
  hasRelatedHistory,
  purgeArchivedAsset,
  type AssetArchiveKind,
} from './asset-archive';
import { loadAssetRows } from './asset-bulk';

export type BulkDeleteAction = 'delete' | 'archive' | 'purge';

export type BulkDeleteSuccess = {
  id: number;
  action: BulkDeleteAction;
  row: Record<string, any>;
  related_total?: number;
  related_counts?: Record<string, number>;
  reason?: string;
};

export type BulkDeleteFailure = {
  id: number;
  row?: Record<string, any> | null;
  message: string;
};

export type BulkDeleteSummary = {
  requested: number;
  processed: number;
  archived: number;
  deleted: number;
  purged: number;
  failed: number;
  successes: BulkDeleteSuccess[];
  failures: BulkDeleteFailure[];
};

type BulkDeleteOptions = {
  allowPhysicalDelete: boolean;
  updatedBy: string | null;
};

function messageOf(error: any) {
  return String(error?.message || error || '删除失败').trim() || '删除失败';
}

export async function bulkDeleteAssets(
  db: D1Database,
  kind: AssetArchiveKind,
  ids: number[],
  options: BulkDeleteOptions,
): Promise<BulkDeleteSummary> {
  const validIds = Array.from(new Set((ids || []).map((id) => Number(id || 0)).filter((id) => id > 0)));
  const rows = await loadAssetRows(db, kind, validIds);
  const rowsById = new Map<number, Record<string, any>>(rows.map((row) => [Number(row.id || 0), row]));

  const successes: BulkDeleteSuccess[] = [];
  const failures: BulkDeleteFailure[] = [];

  for (const id of validIds) {
    const row = rowsById.get(id);
    if (!row) {
      failures.push({ id, row: null, message: kind === 'pc' ? '电脑台账不存在或已删除' : '显示器台账不存在或已删除' });
      continue;
    }

    try {
      if (Number(row.archived || 0) === 1) {
        const purgeSummary = await purgeArchivedAsset(db, kind, id);
        successes.push({
          id,
          row,
          action: 'purge',
          related_total: Number(purgeSummary.related_total || 0),
          related_counts: purgeSummary,
        });
        continue;
      }

      if (kind === 'pc' && String(row.status || '') === 'ASSIGNED') {
        failures.push({ id, row, message: '该电脑当前为已领用状态，请先办理回收/归还后再删除' });
        continue;
      }

      const refs = await getRelatedRecordCounts(db, kind, id);
      const relatedTotal = Object.values(refs || {}).reduce((sum, value) => sum + Number(value || 0), 0);
      const hasRefs = hasRelatedHistory(kind, refs);
      if (hasRefs || !options.allowPhysicalDelete) {
        const archiveReason = hasRefs ? '有历史记录，删除改为归档' : '系统策略：优先归档';
        await archiveAsset(db, kind, id, options.updatedBy || null, archiveReason, null);
        successes.push({
          id,
          row,
          action: 'archive',
          related_total: relatedTotal,
          related_counts: refs,
          reason: archiveReason,
        });
        continue;
      }

      await deleteAssetRow(db, kind, id);
      successes.push({ id, row, action: 'delete' });
    } catch (error: any) {
      failures.push({ id, row, message: messageOf(error) });
    }
  }

  return {
    requested: validIds.length,
    processed: successes.length,
    archived: successes.filter((item) => item.action === 'archive').length,
    deleted: successes.filter((item) => item.action === 'delete').length,
    purged: successes.filter((item) => item.action === 'purge').length,
    failed: failures.length,
    successes,
    failures,
  };
}
