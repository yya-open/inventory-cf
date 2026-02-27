import { requireAuth, errorResponse } from "../_auth";
import { logAudit } from "./_audit";
import { ensurePcSchema, ensurePcSchemaIfAllowed, must, optional, normalizeText } from "./_pc";
import { buildKeywordWhere } from "./_search";
import { createTiming } from "./_timing";

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const t = createTiming();
    await t.measure("auth", () => requireAuth(env, request, "viewer"));
    if (!env.DB) return Response.json({ ok: false, message: "未绑定 D1 数据库(DB)" }, { status: 500 });

    const url = new URL(request.url);
    await t.measure("schema", () => ensurePcSchemaIfAllowed(env.DB, env, url));

    const fast = (url.searchParams.get("fast") || "").trim() === "1"; // 跳过 COUNT(*)，优先首屏速度
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

    // PERF: COUNT(*) 在数据量大时很慢（而且首屏并不需要准确 total）。
    // fast=1 时跳过 total 统计，让列表先出来；前端可再异步请求 /api/pc-assets-count 获取 total。
    let totalCount: number | null = null;
    if (!fast) {
      const totalRow = await t.measure("count", async () => {
        return env.DB.prepare(`SELECT COUNT(*) as c FROM pc_assets a ${where}`).bind(...binds).first<any>();
      });
      totalCount = Number((totalRow as any)?.c || 0);
    }

    // PERF: Avoid scanning whole pc_out/pc_in/pc_recycle tables on every request.
    // 1) First, select the page of asset ids.
    // 2) Only compute latest out/in/recycle for those ids.
    // Requires indexes: (asset_id, id DESC)
    const sql = `
      WITH page_a AS (
        SELECT a.id
        FROM pc_assets a
        ${where}
        ORDER BY a.id ASC
        LIMIT ? OFFSET ?
      ),
      latest_out AS (
        SELECT asset_id, MAX(id) AS max_id
        FROM pc_out
        WHERE asset_id IN (SELECT id FROM page_a)
        GROUP BY asset_id
      ),
      latest_in AS (
        SELECT asset_id, MAX(id) AS max_id
        FROM pc_in
        WHERE asset_id IN (SELECT id FROM page_a)
        GROUP BY asset_id
      ),
      latest_recycle AS (
        SELECT asset_id, MAX(id) AS max_id
        FROM pc_recycle
        WHERE asset_id IN (SELECT id FROM page_a)
        GROUP BY asset_id
      )
      SELECT
        a.*,
        o.employee_no   AS last_employee_no,
        o.employee_name AS last_employee_name,
        o.department    AS last_department,
        o.config_date   AS last_config_date,
        r.recycle_date  AS last_recycle_date,
        o.created_at    AS last_out_at,
        i.created_at    AS last_in_at
      FROM pc_assets a
      JOIN page_a p ON p.id = a.id
      LEFT JOIN latest_out lo ON lo.asset_id = a.id
      LEFT JOIN pc_out o ON o.id = lo.max_id
      LEFT JOIN latest_recycle lr ON lr.asset_id = a.id
      LEFT JOIN pc_recycle r ON r.id = lr.max_id
      LEFT JOIN latest_in li ON li.asset_id = a.id
      LEFT JOIN pc_in i ON i.id = li.max_id
      ORDER BY a.id ASC
    `;

    const { results } = await t.measure("sql", async () => {
      return env.DB.prepare(sql).bind(...binds, pageSize, offset).all();
    });

    const resp = Response.json({ ok: true, data: results, total: totalCount, page, pageSize });
    resp.headers.set("Server-Timing", t.header());
    return resp;
  } catch (e: any) {
    return errorResponse(e);
  }
};


export const onRequestPut: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const user = await requireAuth(env, request, "admin");
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
