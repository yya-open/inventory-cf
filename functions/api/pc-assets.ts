import { requireAuth, errorResponse } from "../_auth";
import { logAudit } from "./_audit";
import { ensurePcSchema, must, optional, normalizeText } from "./_pc";
import { buildKeywordWhere } from "./_search";

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, "viewer");
    if (!env.DB) return Response.json({ ok: false, message: "未绑定 D1 数据库(DB)" }, { status: 500 });

    await ensurePcSchema(env.DB);

    const url = new URL(request.url);
    const status = (url.searchParams.get("status") || "").trim(); // IN_STOCK/ASSIGNED/RECYCLED/SCRAPPED
    const keyword = (url.searchParams.get("keyword") || "").trim();
    const ageYears = Math.max(0, Number(url.searchParams.get("age_years") || 0)); // 出厂超过 N 年

    const page = Math.max(1, Number(url.searchParams.get("page") || 1));
    const pageSize = Math.min(200, Math.max(20, Number(url.searchParams.get("page_size") || 50)));
    const offset = (page - 1) * pageSize;

    const wh: string[] = [];
    const binds: any[] = [];

    if (status) {
      wh.push("a.status=?");
      binds.push(status);
    }

    if (keyword) {
      const kw = buildKeywordWhere(keyword, {
        numericId: "a.id",
        exact: ["a.serial_no"],
        prefix: ["a.serial_no", "a.brand", "a.model"],
        contains: ["a.brand", "a.model", "a.remark"],
      });
      if (kw.sql) {
        wh.push(kw.sql);
        binds.push(...kw.binds);
      }
    }

    if (ageYears > 0) {
      // manufacture_date 存储为 YYYY-MM-DD 文本，按字典序比较即可
      const now = new Date();
      const cutoff = new Date(now.getTime());
      cutoff.setFullYear(cutoff.getFullYear() - ageYears);
      const y = cutoff.getFullYear();
      const m = String(cutoff.getMonth() + 1).padStart(2, "0");
      const d = String(cutoff.getDate()).padStart(2, "0");
      const cutoffStr = `${y}-${m}-${d}`;
      wh.push("a.status<>'SCRAPPED' AND a.manufacture_date IS NOT NULL AND a.manufacture_date<>'' AND a.manufacture_date<=?");
      binds.push(cutoffStr);
    }

    const where = wh.length ? `WHERE ${wh.join(" AND ")}` : "";

    const totalRow = await env.DB.prepare(`SELECT COUNT(*) as c FROM pc_assets a ${where}`).bind(...binds).first<any>();

    // include latest out info for quick view
    const sql = `
      SELECT
        a.*,
        (
          SELECT o.employee_no
          FROM pc_out o
          WHERE o.asset_id=a.id
          ORDER BY o.id DESC
          LIMIT 1
        ) AS last_employee_no,
        (
          SELECT o.employee_name
          FROM pc_out o
          WHERE o.asset_id=a.id
          ORDER BY o.id DESC
          LIMIT 1
        ) AS last_employee_name,
        (
          SELECT o.department
          FROM pc_out o
          WHERE o.asset_id=a.id
          ORDER BY o.id DESC
          LIMIT 1
        ) AS last_department,
        (
          SELECT o.config_date
          FROM pc_out o
          WHERE o.asset_id=a.id
          ORDER BY o.id DESC
          LIMIT 1
        ) AS last_config_date,
        (
          SELECT r.recycle_date
          FROM pc_recycle r
          WHERE r.asset_id=a.id
          ORDER BY r.id DESC
          LIMIT 1
        ) AS last_recycle_date,
        (
          SELECT o.created_at
          FROM pc_out o
          WHERE o.asset_id=a.id
          ORDER BY o.id DESC
          LIMIT 1
        ) AS last_out_at,
        (
          SELECT i.created_at
          FROM pc_in i
          WHERE i.asset_id=a.id
          ORDER BY i.id DESC
          LIMIT 1
        ) AS last_in_at
      FROM pc_assets a
      ${where}
      ORDER BY a.id ASC
      LIMIT ? OFFSET ?
    `;

    const { results } = await env.DB.prepare(sql).bind(...binds, pageSize, offset).all();

    return Response.json({ ok: true, data: results, total: Number(totalRow?.c || 0), page, pageSize });
  } catch (e: any) {
    return errorResponse(e);
  }
};


export const onRequestPut: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const user = await requireAuth(env, request, "operator");
    if (!env.DB) return Response.json({ ok: false, message: "未绑定 D1 数据库(DB)" }, { status: 500 });
    await ensurePcSchema(env.DB);

    const body = await request.json<any>().catch(() => ({} as any));
    const id = Number(body?.id || 0);
    if (!id) throw Object.assign(new Error("缺少资产ID"), { status: 400 });

    const old = await env.DB.prepare("SELECT * FROM pc_assets WHERE id=?").bind(id).first<any>();
    if (!old) throw Object.assign(new Error("电脑台账不存在或已删除"), { status: 404 });

    const brand = must(body?.brand, "品牌", 120);
    const serial_no = must(body?.serial_no, "序列号", 120);
    const model = must(body?.model, "型号", 200);
    const manufacture_date = optional(body?.manufacture_date, 20);
    const warranty_end = optional(body?.warranty_end, 20);
    const disk_capacity = optional(body?.disk_capacity, 60);
    const memory_size = optional(body?.memory_size, 60);
    const remark = optional(body?.remark, 1000);

    const dup = await env.DB.prepare("SELECT id FROM pc_assets WHERE serial_no=? AND id<>?").bind(serial_no, id).first<any>();
    if (dup) throw Object.assign(new Error("序列号已存在"), { status: 400 });

    await env.DB.prepare(`
      UPDATE pc_assets
      SET brand=?, serial_no=?, model=?, manufacture_date=?, warranty_end=?, disk_capacity=?, memory_size=?, remark=?, updated_at=datetime('now')
      WHERE id=?
    `).bind(brand, serial_no, model, manufacture_date, warranty_end, disk_capacity, memory_size, remark, id).run();

    await logAudit(env.DB, request, user, "pc_asset_update", "pc_assets", id, { before: {
      brand: old.brand, serial_no: old.serial_no, model: old.model, manufacture_date: old.manufacture_date,
      warranty_end: old.warranty_end, disk_capacity: old.disk_capacity, memory_size: old.memory_size, remark: old.remark
    }, after: { brand, serial_no, model, manufacture_date, warranty_end, disk_capacity, memory_size, remark } });

    return Response.json({ ok: true, message: "修改成功" });
  } catch (e: any) {
    return errorResponse(e);
  }
};

export const onRequestDelete: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const user = await requireAuth(env, request, "operator");
    if (!env.DB) return Response.json({ ok: false, message: "未绑定 D1 数据库(DB)" }, { status: 500 });
    await ensurePcSchema(env.DB);

    const body = await request.json<any>().catch(() => ({} as any));
    const url = new URL(request.url);
    const id = Number(body?.id || url.searchParams.get("id") || 0);
    if (!id) throw Object.assign(new Error("缺少资产ID"), { status: 400 });

    const asset = await env.DB.prepare("SELECT * FROM pc_assets WHERE id=?").bind(id).first<any>();
    if (!asset) throw Object.assign(new Error("电脑台账不存在或已删除"), { status: 404 });

    if (String(asset.status) === "ASSIGNED") {
      throw Object.assign(new Error("该电脑当前为已领用状态，请先办理回收/归还后再删除"), { status: 400 });
    }

    const refs = await env.DB.prepare(`
      SELECT
        (SELECT COUNT(*) FROM pc_out WHERE asset_id=?) AS out_count,
        (SELECT COUNT(*) FROM pc_recycle WHERE asset_id=?) AS recycle_count
    `).bind(id, id).first<any>();

    if (Number(refs?.out_count || 0) > 0 || Number(refs?.recycle_count || 0) > 0) {
      throw Object.assign(new Error("该电脑已有出库/回收记录，为避免影响台账追溯，暂不允许删除"), { status: 400 });
    }

    await env.DB.batch([
      env.DB.prepare("DELETE FROM pc_in WHERE asset_id=?").bind(id),
      env.DB.prepare("DELETE FROM pc_assets WHERE id=?").bind(id),
    ]);

    await logAudit(env.DB, request, user, "pc_asset_delete", "pc_assets", id, {
      brand: asset.brand, serial_no: asset.serial_no, model: asset.model, status: asset.status
    });

    return Response.json({ ok: true, message: "删除成功" });
  } catch (e: any) {
    return errorResponse(e);
  }
};
