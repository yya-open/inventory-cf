import { requireAuth, errorResponse } from "../_auth";
import { logAudit } from "./_audit";
import { ensurePcSchema, must, optional, pcInNo } from "./_pc";
import { isUniqueConstraintError } from "../_idempotency";

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request, waitUntil }) => {
  try {
    const user = await requireAuth(env, request, "operator");
    if (!env.DB) return Response.json({ ok: false, message: "未绑定 D1 数据库(DB)" }, { status: 500 });

    await ensurePcSchema(env.DB);

    const body = await request.json<any>();

    const brand = must(body?.brand, "品牌", 120);
    const serial_no = must(body?.serial_no, "序列号", 120);
    const model = must(body?.model, "型号", 160);

    // 出厂时间：必填（用于 5 年预警等规则）
    const manufacture_date = must(body?.manufacture_date, "出厂时间", 40);
    const warranty_end = optional(body?.warranty_end, 40);
    const disk_capacity = optional(body?.disk_capacity, 40);
    const memory_size = optional(body?.memory_size, 40);
    const remark = optional(body?.remark, 2000);

    const no = pcInNo();

    // Concurrency-safe create:
    // - Rely on UNIQUE(serial_no) for idempotency under concurrent requests.
    // - Insert pc_in only if asset insert succeeded (changes()>0).
    // - Use last_insert_rowid() to reference the newly created asset.
    const stmts: D1PreparedStatement[] = [
      env.DB.prepare(
        `INSERT INTO pc_assets (brand, serial_no, model, manufacture_date, warranty_end, disk_capacity, memory_size, remark, status)
         VALUES (?,?,?,?,?,?,?,?, 'IN_STOCK')`
      ).bind(brand, serial_no, model, manufacture_date, warranty_end, disk_capacity, memory_size, remark),

      env.DB.prepare(
        `INSERT INTO pc_in (in_no, asset_id, brand, serial_no, model, manufacture_date, warranty_end, disk_capacity, memory_size, remark, created_by)
         SELECT ?, last_insert_rowid(), ?, ?, ?, ?, ?, ?, ?, ?, ?
         WHERE (SELECT changes()) > 0`
      ).bind(no, brand, serial_no, model, manufacture_date, warranty_end, disk_capacity, memory_size, remark, user.username),

      // Fetch asset id regardless (newly inserted or existing)
      env.DB.prepare(`SELECT id FROM pc_assets WHERE serial_no=?`).bind(serial_no),
    ];

    let res: any[];
    try {
      res = (await env.DB.batch(stmts)) as any;
    } catch (e: any) {
      if (isUniqueConstraintError(e)) {
        return Response.json(
          { ok: false, message: "该序列号已存在，请勿重复入库（如需入库/归还请使用「电脑回收/归还」功能）" },
          { status: 409 }
        );
      }
      throw e;
    }

    const assetId = Number((res?.[2] as any)?.results?.[0]?.id || 0);
    const inserted = (res?.[1] as any)?.meta?.changes || 0;
    if (!assetId) throw Object.assign(new Error("创建资产失败"), { status: 500 });

    if (inserted !== 1) {
      // Asset existed but insert didn't throw? Should not happen, but keep safe.
      return Response.json(
        { ok: false, message: "该序列号已存在，请勿重复入库（如需入库/归还请使用「电脑回收/归还」功能）" },
        { status: 409 }
      );
    }

    waitUntil(logAudit(env.DB, request, user, "PC_IN", "pc_in", no, {
      asset_id: assetId,
      brand,
      serial_no,
      model,
      manufacture_date,
      warranty_end,
      disk_capacity,
      memory_size,
      remark,
    }).catch(() => {}));

    return Response.json({ ok: true, in_no: no, asset_id: assetId, created: true });
  } catch (e: any) {
    return errorResponse(e);
  }
};
