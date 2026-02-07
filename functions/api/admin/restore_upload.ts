import { json, requireAuth, errorResponse } from "../../_auth";
import { requireConfirm } from "../../_confirm";
import { logAudit } from "../_audit";

type RestoreMode = "merge" | "replace";

const TABLE_COLUMNS: Record<string, string[]> = {
  warehouses: ["id","name","created_at"],
  items: ["id","sku","name","brand","model","category","unit","warning_qty","enabled","created_at"],
  stock: ["id","item_id","warehouse_id","qty","updated_at"],
  stock_tx: ["id","tx_no","type","item_id","warehouse_id","qty","delta_qty","ref_type","ref_id","ref_no","unit_price","source","target","remark","created_at","created_by"],
  users: ["id","username","password_hash","role","is_active","must_change_password","created_at"],
  auth_login_throttle: ["id","ip","username","fail_count","first_fail_at","last_fail_at","locked_until","updated_at"],
  audit_log: ["id","user_id","username","action","entity","entity_id","payload_json","ip","ua","created_at"],
  stocktake: ["id","st_no","warehouse_id","status","created_at","created_by","applied_at"],
  stocktake_line: ["id","stocktake_id","item_id","system_qty","counted_qty","diff_qty","updated_at"],
};

const DELETE_ORDER = [
  "stocktake_line",
  "stocktake",
  "stock_tx",
  "stock",
  "items",
  "warehouses",
  "audit_log",
  "auth_login_throttle",
  "users",
];

const INSERT_ORDER = [
  "warehouses",
  "items",
  "users",
  "stock",
  "stock_tx",
  "stocktake",
  "stocktake_line",
  "audit_log",
  "auth_login_throttle",
];

function pick(obj: any, cols: string[]) {
  return cols.map((c) => (obj?.[c] === undefined ? null : obj[c]));
}

// POST /api/admin/restore_upload
// multipart/form-data: file=<backup.json>, mode=merge|replace, confirm=...
export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request, waitUntil }) => {
  try {
    const actor = await requireAuth(env, request, "admin");

    const ct = request.headers.get("content-type") || "";
    if (!ct.includes("multipart/form-data")) {
      return Response.json({ ok: false, message: "请使用 multipart/form-data 上传备份文件" }, { status: 400 });
    }

    const form = await request.formData();
    const mode = (String(form.get("mode") || "merge") as RestoreMode) || "merge";
    const confirm = String(form.get("confirm") || "");

    requireConfirm({ mode, confirm } as any, mode === "replace" ? "清空并恢复" : "恢复", "二次确认不通过");

    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ ok: false, message: "缺少 file" }, { status: 400 });
    }

    const text = await file.text();
    const backup = JSON.parse(text || "{}");
    const tables = backup?.tables || {};
    if (!tables || typeof tables !== "object") {
      return Response.json({ ok: false, message: "备份数据为空" }, { status: 400 });
    }

    let insertedTotal = 0;
    const insertedByTable: Record<string, number> = {};

    if (mode === "replace") {
      const del = DELETE_ORDER.map((t) => env.DB.prepare(`DELETE FROM ${t}`));
      await env.DB.batch(del);
    }

    for (const t of INSERT_ORDER) {
      const rows = (tables as any)[t] as any[] | undefined;
      if (!rows?.length) continue;
      const cols = TABLE_COLUMNS[t];
      if (!cols) continue;

      const verb = mode === "merge" ? "INSERT OR IGNORE" : "INSERT OR REPLACE";
      const placeholders = cols.map(() => "?").join(",");
      const sql = `${verb} INTO ${t} (${cols.join(",")}) VALUES (${placeholders})`;

      let i = 0;
      let inserted = 0;
      while (i < rows.length) {
        const chunk = rows.slice(i, i + 50);
        const batch = chunk.map((r) => env.DB.prepare(sql).bind(...pick(r, cols)));
        const res = await env.DB.batch(batch);
        for (const rr of res) inserted += Number((rr as any)?.meta?.changes ?? 0);
        i += 50;
      }

      insertedByTable[t] = inserted;
      insertedTotal += inserted;
    }

    waitUntil(logAudit(env.DB, request, actor, "ADMIN_RESTORE_UPLOAD", "backup", null, {
      mode,
      filename: (file as any).name || null,
      size: (file as any).size || null,
      backup_version: backup?.version || null,
      exported_at: backup?.exported_at || null,
      inserted_total: insertedTotal,
      inserted_by_table: insertedByTable,
    }).catch(() => {}));
    return json(true, {
      mode,
      inserted_total: insertedTotal,
      inserted_by_table: insertedByTable,
    });
  } catch (e: any) {
    return errorResponse(e);
  }
};
