import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8').replace(/\s+/g, ' ');
}

describe('first security and consistency fixes', () => {
  it('binds QR reset endpoints to permission and asset data scope', () => {
    const pc = source('functions/api/pc-assets-reset-qr.ts');
    const monitor = source('functions/api/monitor-assets-reset-qr.ts');

    expect(pc).toContain("requirePermission(env, request, 'qr_reset', 'viewer')");
    expect(pc).toContain('assertPcAssetDataScopeAccess(env.DB, user, id');
    expect(monitor).toContain("requirePermission(env, request, 'qr_reset', 'viewer')");
    expect(monitor).toContain('assertMonitorAssetDataScopeAccess(user, asset.department');
  });

  it('binds snapshot downloads to the job resource and current data scope', () => {
    const batchDownload = source('functions/api/asset-inventory-batch-snapshot-download.ts');
    const genericDownload = source('functions/api/jobs-download.ts');
    const jobs = source('functions/api/services/async-jobs.ts');

    expect(batchDownload).toContain('assertAsyncJobDownloadAccess(env.DB, row, actor, actor)');
    expect(genericDownload).toContain('assertAsyncJobDownloadAccess(env.DB, row, actor, scope)');
    expect(jobs).toContain('snapshot_job_id');
    expect(jobs).toContain('assertAssetInventoryBatchDataScopeAccess(db, scope');
  });

  it('claims async jobs with a compare-and-set status transition and worker lease', () => {
    const jobs = source('functions/api/services/async-jobs.ts');

    expect(jobs).toContain("WHERE id=? AND status='queued' AND cancel_requested=0");
    expect(jobs).toContain('worker_token');
    expect(jobs).toContain('lease_until');
    expect(jobs).toContain('WHERE id=? AND worker_token=?');
  });

  it('rolls back the recorded stocktake delta instead of restoring the old snapshot quantity', () => {
    const rollback = source('functions/api/stocktake/rollback.ts');

    expect(rollback).toContain('SET qty=qty + ?');
    expect(rollback).toContain('bind(-diff, itemId');
    expect(rollback).not.toContain('Number(l.system_qty)');
  });

  it('does not turn data-scope query failures into an empty successful result', () => {
    const scope = source('functions/api/services/data-scope.ts');

    expect(scope).not.toContain("all<any>().catch(() => ({ results: [] as any[] }))");
    expect(scope).not.toContain('first<any>().catch(() => null)');
  });
});