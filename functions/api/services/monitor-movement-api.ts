import { errorResponse, requireAuth } from '../_auth';
import { logAudit } from '../_audit';
import { ensureMonitorSchemaIfAllowed, monitorTxNo } from '../_monitor';
import { normalizeText } from '../_pc';
import { normalizeClientRequestId, toDeterministicNo } from '../../_idempotency';
import {
  applyMonitorMovement,
  assertMonitorMovementAllowed,
  getMonitorAssetByIdOrCode,
  getRequestClientMeta,
  monitorMovementAuditAction,
  type MonitorMovementType,
} from './asset-write';

type Env = { DB: D1Database; JWT_SECRET: string };

type MonitorMovementPrepared = {
  toLocationId?: number | null;
  employeeNo?: string | null;
  department?: string | null;
  employeeName?: string | null;
  isEmployed?: string | null;
  remark?: string | null;
  auditPayload?: Record<string, any>;
};

type MonitorMovementHandlerOptions = {
  type: MonitorMovementType;
  txPrefix: string;
  successMessage: string;
  prepare: (args: { env: Env; request: Request; body: any; asset: any; user: any }) => Promise<MonitorMovementPrepared> | MonitorMovementPrepared;
};

export function createMonitorMovementHandler(options: MonitorMovementHandlerOptions): PagesFunction<Env> {
  return async ({ env, request }) => {
    try {
      const user = await requireAuth(env, request, 'operator');
      if (!env.DB) return Response.json({ ok: false, message: '未绑定 D1 数据库(DB)' }, { status: 500 });
      const url = new URL(request.url);
      await ensureMonitorSchemaIfAllowed(env.DB, env, url);

      const body = await request.json<any>().catch(() => ({} as any));
      const clientRequestId = normalizeClientRequestId(body?.client_request_id);
      const txNo = clientRequestId ? toDeterministicNo(options.txPrefix, clientRequestId) : monitorTxNo(options.txPrefix);
      if (clientRequestId) {
        const existing = await env.DB.prepare('SELECT tx_no, asset_id FROM monitor_tx WHERE tx_no=?').bind(txNo).first<any>();
        if (existing?.tx_no) {
          return Response.json({
            ok: true,
            message: `${options.successMessage}（幂等命中）`,
            duplicate: true,
            data: { tx_no: existing.tx_no, asset_id: Number(existing.asset_id || 0) || null },
          });
        }
      }

      const assetId = Number(body?.asset_id || 0);
      const assetCode = normalizeText(body?.asset_code, 120);
      if (!assetId && !assetCode) throw Object.assign(new Error('缺少资产ID/资产编号'), { status: 400 });

      const asset = await getMonitorAssetByIdOrCode(env.DB, assetId, assetCode);
      assertMonitorMovementAllowed(asset, options.type);

      const prepared = await options.prepare({ env, request, body, asset, user });
      await applyMonitorMovement({
        db: env.DB,
        asset,
        txNo,
        type: options.type,
        userName: user.username,
        clientMeta: getRequestClientMeta(request),
        toLocationId: prepared.toLocationId ?? null,
        employeeNo: prepared.employeeNo ?? null,
        department: prepared.department ?? null,
        employeeName: prepared.employeeName ?? null,
        isEmployed: prepared.isEmployed ?? null,
        remark: prepared.remark ?? null,
      });

      await logAudit(env.DB, request, user, monitorMovementAuditAction(options.type), 'monitor_assets', asset.id, {
        tx_no: txNo,
        ...(prepared.auditPayload || {}),
      });

      return Response.json({
        ok: true,
        message: options.successMessage,
        duplicate: false,
        data: { tx_no: txNo, asset_id: Number(asset.id || 0) || null },
      });
    } catch (e: any) {
      return errorResponse(e);
    }
  };
}
