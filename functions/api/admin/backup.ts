import { requireAuth, errorResponse } from '../../_auth';
import { logAudit } from '../_audit';
import { ensureCoreSchema } from '../_schema';
import { ensurePcSchema } from '../_pc';
import { ensureMonitorSchema } from '../_monitor';
import { buildBackupFilename, buildBackupPayload, parseBackupOptions } from './_backup_helpers';

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
    const payload = await buildBackupPayload(env.DB, backupOptions);

    const jsonText = JSON.stringify(payload);
    let body: BodyInit = jsonText;
    const headers = new Headers({ 'content-type': 'application/json; charset=utf-8' });
    if (gzip) {
      if (typeof (globalThis as any).CompressionStream === 'undefined') {
        throw new Error('当前环境不支持 gzip 压缩');
      }
      const src = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(jsonText));
          controller.close();
        }
      });
      body = src.pipeThrough(new CompressionStream('gzip')) as any;
      headers.set('content-type', 'application/gzip');
      headers.set('content-encoding', 'gzip');
    }

    const table = String(url.searchParams.get('table') || '').trim() || null;
    const fname = buildBackupFilename({ table, gzip });
    if (download) headers.set('content-disposition', `attachment; filename="${fname}"`);

    waitUntil(logAudit(env.DB, request, actor, 'ADMIN_BACKUP', 'backup', null, {
      filename: fname,
      gzip,
      table_count: Object.keys(payload.tables || {}).length,
      stats: payload.stats,
      version: payload.version,
      filters: payload.meta?.filters || null,
    }).catch(() => {}));

    return new Response(body, { headers });
  } catch (e: any) {
    return errorResponse(e);
  }
};
