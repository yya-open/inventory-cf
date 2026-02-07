import { json, requireAuth, errorResponse } from "../../_auth";
import { requireConfirm } from "../../_confirm";
import { logAudit } from "../_audit";

type RestoreMode = "merge" | "replace";

const TABLE_COLUMNS: Record<string, string[]> = {
  warehouses: ["id","name","created_at"],
  items: ["id","sku","name","brand","model","category","unit","warning_qty","enabled","created_at"],
  stock: ["id","item_id","warehouse_id","qty","updated_at"],
  stock_tx: ["id","no","type","item_id","warehouse_id","qty","delta","target","remark","created_at"],
  stocktake: ["id","name","status","created_by","created_at","updated_at"],
  stocktake_line: ["id","stocktake_id","item_id","warehouse_id","before_qty","count_qty","delta","remark","created_at"],
  users: ["id","username","password_hash","role","enabled","created_at","updated_at"],
  auth_login_throttle: ["key","fail_count","locked_until","updated_at"],
  audit_log: ["id","actor","action","entity","entity_id","detail_json","ip","ua","created_at"],
};

const DELETE_ORDER = [
  "stocktake_line",
  "stocktake",
  "stock_tx",
  "stock",
  "items",
  "warehouses",
  "auth_login_throttle",
  "audit_log",
  "users",
];

function pick(obj: any, cols: string[]) {
  return cols.map((c) => (obj && obj[c] !== undefined ? obj[c] : null));
}

// 这个接口用于前端上传 JSON 备份再恢复（兼容旧 UI）
// 新版推荐使用 restore_job（任务化 + 进度条 + 可暂停/续跑）
export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const actor = await requireAuth(env, request, "admin");

    const ct = request.headers.get("content-type") || "";
    if (!ct.includes("multipart/form-data")) {
      return Response.json({ ok: false, message: "请使用 multipart/form-data 上传备份文件" }, { status: 400 });
    }

    const form = await request.formData();
    const mode = (String(form.get("mode") || "merge") as RestoreMode) || "merge";
    const expected = mode === "replace" ? "清空并恢复" : "恢复";
    const confirm = String(form.get("confirm") || "");
    requireConfirm({ mode, confirm } as any, expected, "二次确认不通过");

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

    const verb = mode === "merge" ? "INSERT OR IGNORE" : "INSERT OR REPLACE";

    if (mode === "replace") {
      await env.DB.batch(DELETE_ORDER.map((t) => env.DB.prepare(`DELETE FROM ${t}`)));
    }

    let total = 0;
    for (const [table, rows] of Object.entries(tables)) {
      const cols = TABLE_COLUMNS[table];
      if (!cols) continue;
      if (!Array.isArray(rows) || rows.length === 0) continue;

      const placeholders = cols.map(() => "?").join(",");
      const sql = `${verb} INTO ${table} (${cols.join(",")}) VALUES (${placeholders})`;

      const stmts = (rows as any[]).map((r) => env.DB.prepare(sql).bind(...pick(r, cols)));
      const chunk = 50;
      for (let i = 0; i < stmts.length; i += chunk) {
        await env.DB.batch(stmts.slice(i, i + chunk));
      }
      total += (rows as any[]).length;
    }

    logAudit(env.DB, request, actor, "ADMIN_RESTORE_UPLOAD", "restore", "", {
      mode,
      filename: file.name || null,
      size: file.size,
      total_rows: total,
      version: backup?.version || null,
      exported_at: backup?.exported_at || null,
    }).catch(() => {});

    return json(true, { ok: true, mode, total_rows: total });
  } catch (e: any) {
    return errorResponse(e);
  }
};
