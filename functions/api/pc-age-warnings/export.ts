import { requireAuth, errorResponse } from '../../_auth';
import { ensurePcSchemaIfAllowed } from '../_pc';
import { buildPcAssetQuery, countByWhere, listPcAssets, type QueryParts } from '../services/asset-ledger';

const MAX_EXPORT_ROWS = 10000;
const CHUNK_SIZE = 200;

async function listPcAssetsForExport(db: D1Database, baseQuery: QueryParts, limit: number, offset = 0) {
  const rows: any[] = [];
  let remaining = Math.max(0, limit);
  let currentOffset = Math.max(0, offset);
  while (remaining > 0) {
    const chunkSize = Math.min(CHUNK_SIZE, remaining);
    const chunk = await listPcAssets(db, { ...baseQuery, page: 1, pageSize: chunkSize, offset: currentOffset, fast: false });
    if (!chunk.length) break;
    rows.push(...chunk);
    currentOffset += chunk.length;
    remaining -= chunk.length;
    if (chunk.length < chunkSize) break;
  }
  return rows;
}

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, 'viewer');
    if (!env.DB) return Response.json({ ok: false, message: '未绑定 D1 数据库(DB)' }, { status: 500 });

    const url = new URL(request.url);
    await ensurePcSchemaIfAllowed(env.DB, env, url);

    const scope = String(url.searchParams.get('scope') || 'all').trim().toLowerCase();
    const maxRows = Math.max(1, Math.min(MAX_EXPORT_ROWS, Number(url.searchParams.get('max_rows') || MAX_EXPORT_ROWS)));
    const query = buildPcAssetQuery(url);
    const total = await countByWhere(env.DB, 'pc_assets a', query);

    const isCurrent = scope === 'current';
    const limit = isCurrent ? query.pageSize : Math.min(total, maxRows);
    const offset = isCurrent ? query.offset : 0;
    const data = limit > 0 ? await listPcAssetsForExport(env.DB, query, limit, offset) : [];

    return Response.json({
      ok: true,
      data,
      total,
      limited: !isCurrent && total > maxRows,
      exported: data.length,
      scope: isCurrent ? 'current' : 'all',
      maxRows,
    });
  } catch (error: any) {
    return errorResponse(error);
  }
};
