import { requireAuth, errorResponse } from "../../_auth";
import { ensureMonitorSchemaIfAllowed } from "../_monitor";
import { toSqlRange } from "../_date";
import { buildKeywordWhere } from "../_search";
import { logAudit } from "../_audit";
import { beijingDateStampCompact, sqlBjDateTime } from "../_time";

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request, waitUntil }) => {
  try {
    const actor = await requireAuth(env, request, "viewer");
    if (!env.DB) return Response.json({ ok: false, message: "未绑定 D1 数据库(DB)" }, { status: 500 });
    const url = new URL(request.url);
    await ensureMonitorSchemaIfAllowed(env.DB, env, url);

    const type = (url.searchParams.get("type") || url.searchParams.get("tx_type") || "").trim().toUpperCase();
    const keyword = (url.searchParams.get("keyword") || "").trim();
    const date_from = url.searchParams.get("date_from") || url.searchParams.get("start");
    const date_to = url.searchParams.get("date_to") || url.searchParams.get("end");

    const maxRows = Math.min(100000, Math.max(1000, Number(url.searchParams.get("max") || 50000)));
    const pageSize = 1000;

    const wh: string[] = [];
    const bindsBase: any[] = [];
    if (type) {
      wh.push("t.tx_type=?");
      bindsBase.push(type);
    }
    if (keyword) {
      const kw = buildKeywordWhere(keyword, {
        numericId: "t.id",
        exact: ["t.tx_no", "t.asset_code", "t.sn", "t.employee_no"],
        prefix: ["t.asset_code", "t.sn", "t.brand", "t.model", "t.employee_name", "t.department"],
        contains: ["t.remark", "t.employee_name", "t.department"],
      });
      if (kw.sql) {
        wh.push(kw.sql);
        bindsBase.push(...kw.binds);
      }
    }

    const fromSql = toSqlRange(date_from, false);
    const toSql = toSqlRange(date_to, true);
    if (fromSql) {
      wh.push("t.created_at>=?");
      bindsBase.push(fromSql);
    }
    if (toSql) {
      wh.push("t.created_at<=?");
      bindsBase.push(toSql);
    }

    waitUntil(
      logAudit(env.DB, request, actor, "monitor_tx_export", "monitor_tx", null, {
        type: type || null,
        keyword: keyword || null,
        date_from: date_from || null,
        date_to: date_to || null,
        max: maxRows,
      }).catch(() => {})
    );

    let lastId = Number.MAX_SAFE_INTEGER;
    wh.push("t.id < ?");
    const where = `WHERE ${wh.join(" AND ")}`;

    const sql = `
      SELECT
        t.id,
        t.created_at,
        ${sqlBjDateTime("t.created_at")} AS created_at_bj,
        t.tx_no,
        t.tx_type,
        t.asset_code,
        t.sn,
        t.brand,
        t.model,
        t.size_inch,
        t.employee_no,
        t.employee_name,
        t.department,
        t.remark,
        t.created_by,
        fl.name AS from_location,
        tl.name AS to_location,
        fp.name AS from_parent_location,
        tp.name AS to_parent_location
      FROM monitor_tx t
      LEFT JOIN pc_locations fl ON fl.id = t.from_location_id
      LEFT JOIN pc_locations tl ON tl.id = t.to_location_id
      LEFT JOIN pc_locations fp ON fp.id = fl.parent_id
      LEFT JOIN pc_locations tp ON tp.id = tl.parent_id
      ${where}
      ORDER BY t.id DESC
      LIMIT ?
    `;

    const toCsvCell = (v: any) => {
      const s = String(v ?? "");
      return `"${s.replace(/"/g, '""')}"`;
    };

    const typeText = (v: any) => {
      const x = String(v || "");
      if (x === "IN") return "入库";
      if (x === "OUT") return "出库";
      if (x === "RETURN") return "归还";
      if (x === "TRANSFER") return "调拨";
      if (x === "SCRAP") return "报废";
      if (x === "ADJUST") return "调整";
      return x || "-";
    };

    const filename = `monitor_tx_${beijingDateStampCompact()}.csv`;
    const header = [
      "记录ID",
      "时间",
      "北京时间",
      "流水号",
      "动作",
      "资产编号",
      "SN",
      "品牌",
      "型号",
      "尺寸",
      "工号",
      "姓名",
      "部门",
      "来源位置",
      "目标位置",
      "备注",
      "操作人",
    ];

    const encoder = new TextEncoder();
    const bom = new Uint8Array([0xef, 0xbb, 0xbf]);

    let rowCount = 0;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bom);
        controller.enqueue(encoder.encode(header.map(toCsvCell).join(",") + "\n"));
      },
      async pull(controller) {
        if (rowCount >= maxRows) return controller.close();
        const binds = [...bindsBase, lastId, pageSize];
        const r = await env.DB!.prepare(sql).bind(...binds).all<any>();
        const rows = (r.results || []) as any[];
        if (!rows.length) return controller.close();

        for (const it of rows) {
          lastId = Number(it.id || lastId);
          rowCount++;
          const fromLoc = [it.from_parent_location, it.from_location].filter(Boolean).join("/") || "";
          const toLoc = [it.to_parent_location, it.to_location].filter(Boolean).join("/") || "";
          const line = [
            it.id,
            it.created_at,
            it.created_at_bj,
            it.tx_no,
            typeText(it.tx_type),
            it.asset_code,
            it.sn,
            it.brand,
            it.model,
            it.size_inch,
            it.employee_no,
            it.employee_name,
            it.department,
            fromLoc,
            toLoc,
            it.remark,
            it.created_by,
          ]
            .map(toCsvCell)
            .join(",");
          controller.enqueue(encoder.encode(line + "\n"));
          if (rowCount >= maxRows) break;
        }
      },
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  } catch (e: any) {
    return errorResponse(e);
  }
};
