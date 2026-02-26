import { requireAuth, errorResponse } from "../_auth";
import { logAudit } from "./_audit";
import { ensurePcSchema, must, optional, pcInNo } from "./_pc";

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

    // Upsert asset by serial_no
    const exist = await env.DB.prepare("SELECT id FROM pc_assets WHERE serial_no=?").bind(serial_no).first<any>();
    const no = pcInNo();

    if (exist?.id) {
      return Response.json(
        { ok: false, message: "该序列号已存在，请勿重复入库（如需入库/归还请使用「电脑回收/归还」功能）" },
        { status: 400 }
      );
    } else {

      const ins = await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO pc_assets (brand, serial_no, model, manufacture_date, warranty_end, disk_capacity, memory_size, remark, status)
           VALUES (?,?,?,?,?,?,?,?, 'IN_STOCK')`
        ).bind(brand, serial_no, model, manufacture_date, warranty_end, disk_capacity, memory_size, remark),
      ]);

      // D1 batch meta not reliable for DDL, but INSERT meta usually exists; fallback re-query
      const lastId = Number((ins?.[0] as any)?.meta?.last_row_id || 0) || 0;
      const assetRow = lastId
        ? await env.DB.prepare("SELECT id FROM pc_assets WHERE id=?").bind(lastId).first<any>()
        : await env.DB.prepare("SELECT id FROM pc_assets WHERE serial_no=?").bind(serial_no).first<any>();
      const assetId = Number(assetRow?.id || 0);
      if (!assetId) throw Object.assign(new Error("创建资产失败"), { status: 500 });

      await env.DB.prepare(
        `INSERT INTO pc_in (in_no, asset_id, brand, serial_no, model, manufacture_date, warranty_end, disk_capacity, memory_size, remark, created_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(no, assetId, brand, serial_no, model, manufacture_date, warranty_end, disk_capacity, memory_size, remark, user.username).run();

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
    }
  } catch (e: any) {
    return errorResponse(e);
  }
};
