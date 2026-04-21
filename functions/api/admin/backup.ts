import { requireAuth, errorResponse } from '../../_auth';
import { logAudit } from '../_audit';
import { ensureCoreSchema } from '../_schema';
import { ensurePcSchema } from '../_pc';
import { ensureMonitorSchema } from '../_monitor';
import { buildBackupFilename, createBackupJsonStream, parseBackupOptions } from './_backup_helpers';

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request, waitUntil }) => {
  try {
    const actor = await requireAuth(env, request, 'admin');
    await ensureCoreSchema(env.DB);
    await ensurePcSchema(env.DB);
    await ensureMonitorSchema(env.DB);

    const url = new URL(request.url);
    const gzip = url.searchParams.get('gzip') === '1';
    const download = url.searchParams.get('download') === '1';
    const backupOptions = parseBackupOptions(url.searchParams, { actor: actor.username, reason: 'manual_backup' });
    const payload = await createBackupJsonStream(env.DB, backupOptions);

    let body: BodyInit = payload.stream as any;
    const headers = new Headers({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    if (gzip) {
      if (typeof (globalThis as any).CompressionStream === 'undefined') {
        throw new Error('当前环境不支持 gzip 压缩');
      }
      body = payload.stream.pipeThrough(new CompressionStream('gzip') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>) as any;
      headers.set('content-type', 'application/gzip');
      headers.set('content-encoding', 'gzip');
    }

    const table = String(url.searchParams.get('table') || '').trim() || null;
    const fname = buildBackupFilename({ table, gzip });
    if (download) headers.set('content-disposition', `attachment; filename="${fname}"`);

    waitUntil(logAudit(env.DB, request, actor, 'ADMIN_BACKUP', 'backup', null, {
      filename: fname,
      gzip,
      table_count: payload.tables.length,
      stats: payload.stats,
      version: payload.version,
      filters: payload.meta?.filters || null,
    }).catch(() => {}));

    return new Response(body, { headers });
  } catch (e: any) {
    return errorResponse(e);
  }
};
