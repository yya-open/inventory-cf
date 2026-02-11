import { requireAuth, errorResponse } from "../_auth";
import { logAudit } from "./_audit";
import { ensurePcSchema, optional, pcScrapNo } from "./_pc";

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, "viewer");
    if (!env.DB) return Response.json({ ok: false, message: "未绑定 D1 数据库(DB)" }, { status: 500 });

    await ensurePcSchema(env.DB);

    const url = new URL(request.url);
    const scrap_no = (url.searchParams.get("scrap_no") || "").trim();
    if (!scrap_no) return Response.json({ ok: false, message: "scrap_no 不能为空" }, { status: 400 });

    const rows = await env.DB.prepare(
      `SELECT id, scrap_no, asset_id, brand, serial_no, model,
              manufacture_date, warranty_end, disk_capacity, memory_size, remark,
              scrap_date, reason, created_at, created_by
       FROM pc_scrap
       WHERE scrap_no=?
       ORDER BY id ASC`
    ).bind(scrap_no).all<any>();

    return Response.json({ ok: true, data: (rows as any)?.results || [] });
  } catch (e: any) {
    return errorResponse(e);
  }
};

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request, waitUntil }) => {
  try {
    const user = await requireAuth(env, request, "operator");
    if (!env.DB) return Response.json({ ok: false, message: "未绑定 D1 数据库(DB)" }, { status: 500 });

    await ensurePcSchema(env.DB);

    const body = await request.json<any>();
    const assetIds: number[] = Array.isArray(body?.asset_ids) ? body.asset_ids.map((x: any) => Number(x)).filter((x: any) => Number.isFinite(x) && x > 0) : [];
    if (!assetIds.length) return Response.json({ ok: false, message: "asset_ids 不能为空" }, { status: 400 });

    const reason = optional(body?.reason, 200);
    const scrap_date = optional(body?.scrap_date, 40) || new Date().toISOString().slice(0, 10);

    // Fetch assets
    const placeholders = assetIds.map(() => "?").join(",");
    const assets = await env.DB.prepare(
      `SELECT id, brand, serial_no, model, manufacture_date, warranty_end, disk_capacity, memory_size, remark, status
       FROM pc_assets
       WHERE id IN (${placeholders})`
    ).bind(...assetIds).all<any>();

    const rows: any[] = (assets as any)?.results || [];
    if (!rows.length) return Response.json({ ok: false, message: "未找到任何资产" }, { status: 404 });

    const notAllowed = rows.filter((r) => r.status === "ASSIGNED").map((r) => `${r.serial_no || r.id}`);
    if (notAllowed.length) {
      return Response.json({ ok: false, message: `以下资产处于「已领用」状态，不能直接报废：${notAllowed.join("、")}（请先回收/归还）` }, { status: 400 });
    }

    const already = rows.filter((r) => r.status === "SCRAPPED").map((r) => `${r.serial_no || r.id}`);
    if (already.length) {
      return Response.json({ ok: false, message: `以下资产已报废，无需重复报废：${already.join("、")}` }, { status: 400 });
    }

    const scrap_no = pcScrapNo();

    const stmts: D1PreparedStatement[] = [];
    for (const a of rows) {
      stmts.push(
        env.DB.prepare(`UPDATE pc_assets SET status='SCRAPPED', updated_at=datetime('now') WHERE id=?`).bind(a.id),
        env.DB.prepare(
          `INSERT INTO pc_scrap (
            scrap_no, asset_id,
            brand, serial_no, model,
            manufacture_date, warranty_end, disk_capacity, memory_size, remark,
            scrap_date, reason, created_by
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
        ).bind(
          scrap_no, a.id,
          a.brand, a.serial_no, a.model,
          a.manufacture_date || "", a.warranty_end || "", a.disk_capacity || "", a.memory_size || "", a.remark || "",
          scrap_date, reason, user.username
        )
      );
    }

    await env.DB.batch(stmts);

    waitUntil(logAudit(env.DB, request, user, "PC_SCRAP", "pc_scrap", scrap_no, {
      scrap_no,
      asset_ids: assetIds,
      scrap_date,
      reason,
      count: rows.length,
    }).catch(() => {}));

    return Response.json({ ok: true, scrap_no, count: rows.length });
  } catch (e: any) {
    return errorResponse(e);
  }
};
