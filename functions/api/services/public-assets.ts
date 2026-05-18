import { verifyJwt } from '../_auth';
import { sqlNowStored } from '../_time';
import { throwHttpError } from '../_error';
import { resolveInventoryBatchIdForWrite } from './asset-inventory-batches';
import { cleanupPublicThrottleBuckets, ensurePublicThrottleTable, getClientIp, incrementPublicThrottleBucket } from './rate-limit';

export type PublicAssetKind = 'pc' | 'monitor';

type ResolvePublicAssetArgs = {
  env: { DB: D1Database; JWT_SECRET?: string };
  request: Request;
  kind: PublicAssetKind;
  allowToken?: boolean;
};

const PUBLIC_INVENTORY_ISSUE_TYPES = new Set([
  'NOT_FOUND',
  'WRONG_LOCATION',
  'WRONG_QR',
  'WRONG_STATUS',
  'MISSING',
  'OTHER',
]);

const ASSET_CONFIG: Record<PublicAssetKind, {
  assetTable: 'pc_assets' | 'monitor_assets';
  label: string;
  scope: 'pc_view' | 'monitor_view';
  tokenField: 'pc_asset_id' | 'monitor_asset_id';
}> = {
  pc: {
    assetTable: 'pc_assets',
    label: '电脑台账',
    scope: 'pc_view',
    tokenField: 'pc_asset_id',
  },
  monitor: {
    assetTable: 'monitor_assets',
    label: '显示器台账',
    scope: 'monitor_view',
    tokenField: 'monitor_asset_id',
  },
};

export { ensurePublicThrottleTable, getClientIp };

export async function rateLimitPublic(db: D1Database, request: Request, route: string, subject: string, limitPerMinute: number) {
  await ensurePublicThrottleTable(db);

  const ip = getClientIp(request) || 'unknown';
  const minuteBucket = Math.floor(Date.now() / 60000);
  const key = `${route}|${subject}|${ip}|${minuteBucket}`;

  if ((Date.now() & 63) === 0) await cleanupPublicThrottleBuckets(db, 2);

  const row = await incrementPublicThrottleBucket(db, key);
  if (Number(row?.count || 0) > limitPerMinute) {
    throwHttpError('访问过于频繁，请稍后再试', 429);
  }
}

export function parsePublicInventoryBody(body: any) {
  const action = String(body?.action || '').toUpperCase();
  const issueType = String(body?.issue_type || '').toUpperCase();
  const remark = String(body?.remark || '').slice(0, 500).trim();

  if (action !== 'OK' && action !== 'ISSUE') {
    throwHttpError('action 参数无效', 400);
  }
  if (action === 'ISSUE' && !PUBLIC_INVENTORY_ISSUE_TYPES.has(issueType)) {
    throwHttpError('issue_type 参数无效', 400);
  }

  return {
    action,
    issueType: action === 'ISSUE' ? issueType : null,
    remark: remark || null,
  };
}

export function publicAssetSubject(url: URL) {
  return url.searchParams.get('id') || url.searchParams.get('token')?.slice(0, 12) || 'unknown';
}

export async function resolvePublicAssetId(args: ResolvePublicAssetArgs) {
  const { env, request, kind } = args;
  const allowToken = args.allowToken !== false;
  const cfg = ASSET_CONFIG[kind];
  const url = new URL(request.url);
  const idParam = String(url.searchParams.get('id') || '').trim();
  const keyParam = String(url.searchParams.get('key') || '').trim();
  const token = String(url.searchParams.get('token') || '').trim();

  if (idParam && keyParam) {
    const id = Number(idParam || 0);
    if (!id || !keyParam) {
      throwHttpError('二维码参数无效', 400);
    }
    const row = await env.DB.prepare(`SELECT id, qr_key FROM ${cfg.assetTable} WHERE id=?`).bind(id).first<any>();
    if (!row) {
      throwHttpError(`${cfg.label}不存在或已删除`, 404);
    }
    const dbKey = String(row.qr_key || '').trim();
    if (!dbKey) {
      throwHttpError(`该${kind === 'pc' ? '电脑' : '显示器'}尚未启用二维码（请先在系统里生成一次二维码）`, 400);
    }
    if (dbKey !== keyParam) {
      throwHttpError('二维码已失效（可能已被重置）', 401);
    }
    return id;
  }

  if (allowToken && token) {
    if (!env.JWT_SECRET) {
      throwHttpError('缺少 JWT_SECRET', 500);
    }
    const payload = await verifyJwt(token, env.JWT_SECRET);
    if (!payload) {
      throwHttpError('二维码已失效', 401);
    }
    if (payload.scope !== cfg.scope) {
      throwHttpError('二维码无效', 401);
    }
    const id = Number(payload[cfg.tokenField] || 0);
    if (!id) {
      throwHttpError('二维码无效', 401);
    }
    return id;
  }

  throwHttpError('缺少二维码参数', 400);
}

function duplicateInventoryPrompt(kind: PublicAssetKind, existing: any) {
  const issueLabel = existing?.issue_type ? `（${String(existing.issue_type || '').toUpperCase()}）` : '';
  const actionLabel = String(existing?.action || '').toUpperCase() === 'ISSUE' ? `异常${issueLabel}` : '在位';
  const targetLabel = kind === 'pc' ? '该电脑' : '该显示器';
  return `${targetLabel}本轮已记录为${actionLabel}（${String(existing?.created_at || '-')}），请勿重复点击“就位”。如需更正，请先删除原盘点记录后再重新提交。`;
}

function inactiveInventoryBatchPrompt(kind: PublicAssetKind) {
  return kind === 'pc'
    ? '当前未开启电脑盘点，请先在电脑台账页点击“开启新一轮”后再扫码提交。'
    : '当前未开启显示器盘点，请先在显示器台账页点击“开启新一轮”后再扫码提交。';
}

async function getExistingInventoryLog(
  db: D1Database,
  kind: PublicAssetKind,
  assetId: number,
  batchId: number | null,
) {
  const table = kind === 'pc' ? 'pc_inventory_log' : 'monitor_inventory_log';
  const sql = batchId == null
    ? `SELECT id, action, issue_type, remark, created_at, batch_id
         FROM ${table}
        WHERE asset_id=? AND batch_id IS NULL
        ORDER BY created_at DESC, id DESC
        LIMIT 1`
    : `SELECT id, action, issue_type, remark, created_at, batch_id
         FROM ${table}
        WHERE asset_id=? AND batch_id=?
        ORDER BY created_at DESC, id DESC
        LIMIT 1`;
  const stmt = batchId == null ? db.prepare(sql).bind(assetId) : db.prepare(sql).bind(assetId, batchId);
  return stmt.first<any>();
}

async function applyInventoryStateForAction(
  db: D1Database,
  kind: PublicAssetKind,
  assetId: number,
  batchId: number,
  action: string,
  issueType: string | null,
) {
  const assetTable = kind === 'pc' ? 'pc_assets' : 'monitor_assets';
  const normalized = String(action || '').toUpperCase();
  const inventoryStatus = normalized === 'ISSUE' ? 'CHECKED_ISSUE' : normalized === 'OK' ? 'CHECKED_OK' : 'UNCHECKED';
  const inventoryIssueType = normalized === 'ISSUE' ? (issueType || null) : null;
  await db.prepare(
    `UPDATE ${assetTable}
        SET inventory_status=?,
            inventory_at=${sqlNowStored()},
            inventory_issue_type=?,
            inventory_batch_id=?,
            updated_at=${sqlNowStored()}
      WHERE id=?`
  ).bind(inventoryStatus, inventoryIssueType, batchId, assetId).run();
}

export async function insertPublicInventoryLog(
  db: D1Database,
  kind: PublicAssetKind,
  assetId: number,
  action: string,
  issueType: string | null,
  remark: string | null,
  request: Request,
) {
  const table = kind === 'pc' ? 'pc_inventory_log' : 'monitor_inventory_log';
  const ip = getClientIp(request) || '';
  const ua = (request.headers.get('User-Agent') || '').slice(0, 300);

  const batchId = await resolveInventoryBatchIdForWrite(db, kind);
  if (!batchId) {
    throw Object.assign(new Error(inactiveInventoryBatchPrompt(kind)), {
      status: 409,
      code: 'NO_ACTIVE_INVENTORY_BATCH',
    });
  }
  const existing = await getExistingInventoryLog(db, kind, assetId, batchId);

  if (existing?.id) {
    if (String(action || '').toUpperCase() === 'OK') {
      throw Object.assign(new Error(duplicateInventoryPrompt(kind, existing)), {
        status: 409,
        code: 'DUPLICATE_INVENTORY_LOG',
        data: {
          id: Number(existing.id),
          action: String(existing.action || '').toUpperCase(),
          issue_type: existing.issue_type ? String(existing.issue_type).toUpperCase() : null,
          created_at: existing.created_at ? String(existing.created_at) : null,
        },
      });
    }

    await db
      .prepare(
        `UPDATE ${table}
            SET action=?,
                issue_type=?,
                remark=?,
                ip=?,
                ua=?,
                created_at=${sqlNowStored()}
          WHERE id=?`
      )
      .bind(action, issueType, remark, ip, ua, Number(existing.id))
      .run();

    await applyInventoryStateForAction(db, kind, assetId, batchId, action, issueType);
    return { ok: true, updated: true, id: Number(existing.id) };
  }

  await db
    .prepare(
      `INSERT INTO ${table} (asset_id, action, issue_type, remark, ip, ua, batch_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ${sqlNowStored()})`
    )
    .bind(assetId, action, issueType, remark, ip, ua, batchId)
    .run();

  await applyInventoryStateForAction(db, kind, assetId, batchId, action, issueType);
  return { ok: true, updated: false };
}
