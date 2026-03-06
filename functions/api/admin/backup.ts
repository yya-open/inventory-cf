import { requireAuth, errorResponse } from '../../_auth';
import { logAudit } from '../_audit';
import { ensureCoreSchema } from '../_schema';
import { ensurePcSchema } from '../_pc';
import { ensureMonitorSchema } from '../_monitor';
import { buildBackupPayload } from './_backup_helpers';

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request, waitUntil }) => {
  try {
    const actor = await requireAuth(env, request, 'admin');
    await ensureCoreSchema(env.DB);
    await ensurePcSchema(env.DB);
    await ensureMonitorSchema(env.DB);

    const payload = await buildBackupPayload(env.DB, { actor: actor.username, reason: 'manual_backup' });
    const url = new URL(request.url);
    const gzip = url.searchParams.get('gzip') === '1';
    const download = url.searchParams.get('download') === '1';

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

    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const fname = `inventory_backup_${y}${m}${day}.json${gzip ? '.gz' : ''}`;
    if (download) headers.set('content-disposition', `attachment; filename="${fname}"`);

    waitUntil(logAudit(env.DB, request, actor, 'ADMIN_BACKUP', 'backup', null, {
      filename: fname,
      gzip,
      table_count: Object.keys(payload.tables || {}).length,
      stats: payload.stats,
      version: payload.version,
    }).catch(() => {}));

    return new Response(body, { headers });
  } catch (e: any) {
    return errorResponse(e);
  }
};
