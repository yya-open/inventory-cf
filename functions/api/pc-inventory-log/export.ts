import { requireAuth, errorResponse } from "../../_auth";
import { ensurePcSchemaIfAllowed } from "../_pc";
import { toSqlRange } from "../_date";
import { buildKeywordWhere } from "../_search";
import { logAudit } from "../_audit";
import { beijingDateStampCompact, sqlBjDateTime } from "../_time";

/**
 * GET /api/pc-inventory-log/export
 * Export pc_inventory_log as CSV (UTF-8 with BOM) generated on the backend.
 */
export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request, waitUntil }) => {
  try {
    const actor = await requireAuth(env, request, "viewer");
    if (!env.DB) return Response.json({ ok: false, message: "未绑定 D1 数据库(DB)" }, { status: 500 });

    const url = new URL(request.url);
    const t = (env as any).__timing;
    if (t?.measure) await t.measure("schema", () => ensurePcSchemaIfAllowed(env.DB, env, url));
    else await ensurePcSchemaIfAllowed(env.DB, env, url);

    const action = (url.searchParams.get("action") || "").trim().toUpperCase();
    const issue_type = (url.searchParams.get("issue_type") || "").trim().toUpperCase();
    const keyword = (url.searchParams.get("keyword") || "").trim();
    const date_from = url.searchParams.get("date_from");
    const date_to = url.searchParams.get("date_to");

    const maxRows = Math.min(100000, Math.max(1000, Number(url.searchParams.get("max") || 50000)));
    const pageSize = 1000;

    const wh: string[] = [];
    const bindsBase: any[] = [];

    if (action === "OK" || action === "ISSUE") {
      wh.push("l.action=?");
      bindsBase.push(action);
    }
    if (issue_type) {
      wh.push("l.issue_type=?");
      bindsBase.push(issue_type);
    }

    if (keyword) {
      const kw = buildKeywordWhere(keyword, {
        numericId: "l.id",
        exact: ["a.serial_no", "o.employee_no"],
        prefix: [
          "a.serial_no",
          "a.brand",
          "a.model",
          "o.employee_no",
          "o.employee_name",
          "o.department",
          "l.action",
          "l.issue_type",
          "l.ip",
        ],
        contains: ["a.remark", "l.remark", "o.employee_name", "o.department", "l.ua"],
      });
      if (kw.sql) {
        wh.push(kw.sql);
        bindsBase.push(...kw.binds);
      }
    }

    const fromSql = toSqlRange(date_from, false);
    const toSql = toSqlRange(date_to, true);
    if (fromSql) {
      wh.push("l.created_at >= ?");
      bindsBase.push(fromSql);
    }
    if (toSql) {
      wh.push("l.created_at <= ?");
      bindsBase.push(toSql);
    }

    // Best-effort audit (do not block export stream)
    waitUntil(
      logAudit(env.DB, request, actor, "pc_inventory_log_export", "pc_inventory_log", null, {
        action: action || null,
        issue_type: issue_type || null,
        keyword: keyword || null,
        date_from: date_from || null,
        date_to: date_to || null,
        max: maxRows,
      }).catch(() => {})
    );

    // Keyset pagination: id desc
    let lastId = Number.MAX_SAFE_INTEGER;
    wh.push("l.id < ?");
    const where = `WHERE ${wh.join(" AND ")}`;

    const sql = `
      WITH latest_out AS (
        SELECT asset_id, MAX(id) AS max_id
        FROM pc_out
        GROUP BY asset_id
      )
      SELECT
        l.id,
        l.created_at,
        ${sqlBjDateTime("l.created_at")} AS created_at_bj,
        l.action,
        l.issue_type,
        l.remark,
        l.ip,
        a.serial_no,
        a.brand,
        a.model,
        a.status,
        o.employee_no   AS employee_no,
        o.employee_name AS employee_name,
        o.department    AS department
      FROM pc_inventory_log l
      JOIN pc_assets a ON a.id = l.asset_id
      LEFT JOIN latest_out lo ON lo.asset_id = l.asset_id
      LEFT JOIN pc_out o ON o.id = lo.max_id
      ${where}
      ORDER BY l.id DESC
      LIMIT ?
    `;

    const toCsvCell = (v: any) => {
      const s = String(v ?? "");
      return `"${s.replace(/"/g, '""')}"`;
    };

    const filename = `pc_inventory_log_${beijingDateStampCompact()}.csv`;
    const statusText = (s: any) => {
      const v = String(s || "");
      if (v === "IN_STOCK") return "在库";
      if (v === "ASSIGNED") return "已领用";
      if (v === "RECYCLED") return "已回收";
      if (v === "SCRAPPED") return "已报废";
      return v || "-";
    };

    const issueTypeText = (s: any) => {
      const v = String(s || "");
      if (v === "NOT_FOUND") return "找不到电脑";
      if (v === "WRONG_LOCATION") return "位置不符";
      if (v === "WRONG_QR") return "二维码不符";
      if (v === "WRONG_STATUS") return "台账状态不符";
      if (v === "MISSING") return "设备缺失";
      if (v === "OTHER") return "其他原因";
      return v || "-";
    };

    const header = ["时间", "结果", "异常类型", "SN", "品牌", "型号", "台账状态", "员工工号", "员工姓名", "部门", "备注"];

    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();

    (async () => {
      try {
        await writer.write(new TextEncoder().encode("\ufeff" + header.map(toCsvCell).join(",") + "\n"));

        let written = 0;
        while (written < maxRows) {
          const binds = [...bindsBase, lastId, pageSize];
          const { results } = await env.DB.prepare(sql).bind(...binds).all<any>();
          const rows = (results || []) as any[];
          if (!rows.length) break;

          for (const r of rows) {
            const line = [
              r.created_at_bj || r.created_at,
              r.action === "OK" ? "在位" : "异常",
              issueTypeText(r.issue_type),
              r.serial_no,
              r.brand,
              r.model,
              statusText(r.status),
              r.employee_no || "",
              r.employee_name || "",
              r.department || "",
              r.remark || "",
            ]
              .map(toCsvCell)
              .join(",")
              .concat("\n");
            await writer.write(new TextEncoder().encode(line));
            written += 1;
            if (written >= maxRows) break;
          }

          lastId = Number(rows[rows.length - 1].id);
          if (!lastId) break;
          if (rows.length < pageSize) break;
        }
      } catch {
        // ignore streaming errors
      } finally {
        try {
          await writer.close();
        } catch {}
      }
    })();

    return new Response(readable, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
      },
    });
  } catch (e: any) {
    return errorResponse(e);
  }
};
