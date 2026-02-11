import { requireAuth, errorResponse } from "../_auth";
import { logAudit } from "./_audit";
import { ensurePcSchema, must, optional, pcInNo } from "./_pc";

type Item = {
  brand: string;
  serial_no: string;
  model: string;
  manufacture_date?: string;
  warranty_end?: string;
  disk_capacity?: string;
  memory_size?: string;
  remark?: string;
};

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request, waitUntil }) => {
  try {
    const user = await requireAuth(env, request, "operator");
    if (!env.DB) return Response.json({ ok: false, message: "未绑定 D1 数据库(DB)" }, { status: 500 });

    await ensurePcSchema(env.DB);

    const body = await request.json<any>();
    const items: Item[] = Array.isArray(body?.items) ? body.items : [];
    if (!items.length) return Response.json({ ok: false, message: "items 不能为空" }, { status: 400 });

    let success = 0;
    const errors: { row: number; message: string }[] = [];

    for (let i = 0; i < items.length; i++) {
      try {
        const it: any = items[i] || {};
        const brand = must(it?.brand, "品牌", 120);
        const serial_no = must(it?.serial_no, "序列号", 120);
        const model = must(it?.model, "型号", 160);

        // 出厂时间：必填（用于 5 年预警等规则）
        const manufacture_date = must(it?.manufacture_date, "出厂时间", 40);
        const warranty_end = optional(it?.warranty_end, 40);
        const disk_capacity = optional(it?.disk_capacity, 40);
        const memory_size = optional(it?.memory_size, 40);
        const remark = optional(it?.remark, 2000);

        const exist = await env.DB.prepare("SELECT id FROM pc_assets WHERE serial_no=?").bind(serial_no).first<any>();
        const no = pcInNo();

        if (exist?.id) {
          const assetId = Number(exist.id);
          await env.DB.batch([
            env.DB.prepare(
              `UPDATE pc_assets
               SET brand=?, model=?, manufacture_date=?, warranty_end=?, disk_capacity=?, memory_size=?, remark=?,
                   status='IN_STOCK',
                   updated_at=datetime('now')
               WHERE id=?`
            ).bind(brand, model, manufacture_date, warranty_end, disk_capacity, memory_size, remark, assetId),

            env.DB.prepare(
              `INSERT INTO pc_in (
                in_no, asset_id,
                brand, serial_no, model,
                manufacture_date, warranty_end, disk_capacity, memory_size,
                remark, created_by
              ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`
            ).bind(no, assetId, brand, serial_no, model, manufacture_date, warranty_end, disk_capacity, memory_size, remark, user?.id || ""),
          ]);
        } else {
          const rs: any = await env.DB.batch([
            env.DB.prepare(
              `INSERT INTO pc_assets (
                brand, serial_no, model, manufacture_date, warranty_end, disk_capacity, memory_size, remark, status
              ) VALUES (?,?,?,?,?,?,?,?, 'IN_STOCK')`
            ).bind(brand, serial_no, model, manufacture_date, warranty_end, disk_capacity, memory_size, remark),

            env.DB.prepare("SELECT id FROM pc_assets WHERE serial_no=?").bind(serial_no),
          ]);

          const assetId = Number(rs?.[1]?.results?.[0]?.id || rs?.[1]?.results?.id || 0);
          if (!assetId) {
            const q = await env.DB.prepare("SELECT id FROM pc_assets WHERE serial_no=?").bind(serial_no).first<any>();
            if (!q?.id) throw new Error("写入资产失败");
            await env.DB.prepare(
              `INSERT INTO pc_in (
                in_no, asset_id,
                brand, serial_no, model,
                manufacture_date, warranty_end, disk_capacity, memory_size,
                remark, created_by
              ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`
            ).bind(no, Number(q.id), brand, serial_no, model, manufacture_date, warranty_end, disk_capacity, memory_size, remark, user?.id || "").run();
          } else {
            await env.DB.prepare(
              `INSERT INTO pc_in (
                in_no, asset_id,
                brand, serial_no, model,
                manufacture_date, warranty_end, disk_capacity, memory_size,
                remark, created_by
              ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`
            ).bind(no, assetId, brand, serial_no, model, manufacture_date, warranty_end, disk_capacity, memory_size, remark, user?.id || "").run();
          }
        }

        waitUntil(logAudit(env.DB, user, "pc_in_batch", `电脑批量入库：${serial_no}`, { serial_no, brand, model }));
        success++;
      } catch (e: any) {
        errors.push({ row: i + 2, message: e?.message || "导入失败" }); // +2: header row + 1-based
      }
    }

    return Response.json({ ok: true, success, failed: errors.length, errors });
  } catch (e: any) {
    return errorResponse(e);
  }
};
