import { requireAuth, errorResponse } from "../_auth";
import { logAudit } from "./_audit";
import { ensurePcSchema, must, optional, pcInNo } from "./_pc";
import { isUniqueConstraintError } from "../_idempotency";

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

    const seenSerial = new Set<string>();

    for (let i = 0; i < items.length; i++) {
      try {
        const it: any = items[i] || {};
        const brand = must(it?.brand, "品牌", 120);
        const serial_no = must(it?.serial_no, "序列号", 120);
        const model = must(it?.model, "型号", 160);

const snKey = String(serial_no || "").trim();
if (seenSerial.has(snKey)) {
  throw new Error(`序列号重复：${snKey}`);
}
seenSerial.add(snKey);

        // 出厂时间：必填（用于 5 年预警等规则）
        const manufacture_date = must(it?.manufacture_date, "出厂时间", 40);
        const warranty_end = optional(it?.warranty_end, 40);
        const disk_capacity = optional(it?.disk_capacity, 40);
        const memory_size = optional(it?.memory_size, 40);
        const remark = optional(it?.remark, 2000);

        const no = pcInNo();

        // Concurrency-safe create per row:
        // - rely on UNIQUE(serial_no)
        // - insert pc_in only if asset insert succeeded
        let res: any[];
        try {
          res = (await env.DB.batch([
            env.DB.prepare(
              `INSERT INTO pc_assets (
                brand, serial_no, model, manufacture_date, warranty_end, disk_capacity, memory_size, remark, status
              ) VALUES (?,?,?,?,?,?,?,?, 'IN_STOCK')`
            ).bind(brand, serial_no, model, manufacture_date, warranty_end, disk_capacity, memory_size, remark),

            env.DB.prepare(
              `INSERT INTO pc_in (
                in_no, asset_id,
                brand, serial_no, model,
                manufacture_date, warranty_end, disk_capacity, memory_size,
                remark, created_by
              )
              SELECT ?, last_insert_rowid(), ?, ?, ?, ?, ?, ?, ?, ?, ?
              WHERE (SELECT changes()) > 0`
            ).bind(no, brand, serial_no, model, manufacture_date, warranty_end, disk_capacity, memory_size, remark, user.username),

            env.DB.prepare("SELECT id FROM pc_assets WHERE serial_no=?").bind(serial_no),
          ])) as any;
        } catch (e: any) {
          if (isUniqueConstraintError(e)) {
            throw new Error("该序列号已存在，请勿重复入库（如需入库/归还请使用「电脑回收/归还」功能）");
          }
          throw e;
        }

        const inserted = (res?.[1] as any)?.meta?.changes || 0;
        if (inserted !== 1) throw new Error("该序列号已存在，请勿重复入库（可能被并发导入）");

        waitUntil(
          logAudit(env.DB, request, user, "PC_IN", "pc_in", no, { serial_no, brand, model }).catch(() => {})
        );
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
