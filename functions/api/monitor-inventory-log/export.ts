import { requireAuth, errorResponse } from "../../_auth";
import { ensureMonitorSchemaIfAllowed } from "../_monitor";
import { toSqlRange } from "../_date";
import { buildKeywordWhere } from "../_search";
import { logAudit } from "../_audit";
import { beijingDateStampCompact } from "../_time";

function statusText(s: string) {
  if (s === "IN_STOCK") return "在库";
  if (s === "ASSIGNED") return "已领用";
  if (s === "RECYCLED") return "已回收";
  if (s === "SCRAPPED") return "已报废";
  return s || "-";
}

function issueTypeText(s: string) {
  if (s === "NOT_FOUND") return "找不到显示器";
  if (s === "WRONG_LOCATION") return "位置不符";
  if (s === "WRONG_QR") return "二维码不符";
  if (s === "WRONG_STATUS") return "台账状态不符";
  if (s === "MISSING") return "设备缺失";
  if (s === "OTHER") return "其他原因";
  return s || "-";
}

function csvEscape(v: any) {
  const s = String(v ?? "");
  if (/[\r\n,\"]/g.test(s)) return `"${s.replace(/\"/g, '""')}"`;
  return s;
}

/**
 * GET /api/monitor-inventory-log/export
 * Export monitor_inventory_log as CSV (UTF-8 with BOM)
 */
export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request, waitUntil }) => {
  try {
    const actor = await requireAuth(env, request, "viewer");
    if (!env.DB) return Response.json({ ok: false, message: "未绑定 D1 数据库(DB)" }, { status: 500 });

    const url = new URL(request.url);
    await ensureMonitorSchemaIfAllowed(env.DB, env, url);

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
        exact: ["a.asset_code", "a.sn", "a.employee_no"],
        prefix: [
          "a.asset_code",
          "a.sn",
          "a.brand",
          "a.model",
          "a.size_inch",
          "a.employee_no",
          "a.employee_name",
          "a.department",
          "l.action",
          "l.issue_type",
          "loc.name",
        ],
        contains: ["a.remark", "l.remark", "l.ua"],
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

    const where = wh.length ? `WHERE ${wh.join(" AND ")}` : "";

    waitUntil(
      logAudit(env.DB, request, actor, "monitor_inventory_log_export", "monitor_inventory_log", null, {
        action: action || null,
        issue_type: issue_type || null,
        keyword: keyword || null,
        date_from: date_from || null,
        date_to: date_to || null,
      }).catch(() => {})
    );

    const header = [
      "时间",
      "结果",
      "异常类型",
      "资产编号",
      "SN",
      "品牌",
      "型号",
      "尺寸",
      "台账状态",
      "位置",
      "领用信息",
      "备注",
    ].join(",");

    let csv = "\ufeff" + header + "\n";
    let exported = 0;

    for (let offset = 0; offset < maxRows; offset += pageSize) {
      const sql = `
        SELECT
          l.id,
          l.action,
          l.issue_type,
          l.remark,
          l.created_at,
          a.asset_code,
          a.sn,
          a.brand,
          a.model,
          a.size_inch,
          a.status,
          loc.name AS location_name,
          a.employee_no,
          a.employee_name,
          a.department
        FROM monitor_inventory_log l
        JOIN monitor_assets a ON a.id = l.asset_id
        LEFT JOIN pc_locations loc ON loc.id = a.location_id
        ${where}
        ORDER BY l.created_at DESC, l.id DESC
        LIMIT ? OFFSET ?
      `;

      const { results } = await env.DB.prepare(sql).bind(...bindsBase, pageSize, offset).all<any>();
      if (!results?.length) break;

      for (const r of results) {
        const empInfo = r.employee_no || r.employee_name || r.department ? `${r.employee_no || '-'} / ${r.employee_name || '-'} / ${r.department || '-'}` : "-";
        const line = [
          csvEscape(r.created_at || ""),
          csvEscape(r.action === "OK" ? "在位" : "异常"),
          csvEscape(issueTypeText(String(r.issue_type || ""))),
          csvEscape(r.asset_code || ""),
          csvEscape(r.sn || ""),
          csvEscape(r.brand || ""),
          csvEscape(r.model || ""),
          csvEscape(r.size_inch || ""),
          csvEscape(statusText(String(r.status || ""))),
          csvEscape(r.location_name || "-"),
          csvEscape(empInfo),
          csvEscape(r.remark || ""),
        ].join(",");
        csv += line + "\n";
        exported++;
        if (exported >= maxRows) break;
      }

      if (exported >= maxRows) break;
    }

    const filename = `monitor_inventory_log_${beijingDateStampCompact()}.csv`;

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  } catch (e: any) {
    return errorResponse(e);
  }
};
