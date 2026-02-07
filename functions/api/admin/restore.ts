import { json, requireAuth, errorResponse } from "../../_auth";
import { requireConfirm } from "../../_confirm";
import { logAudit } from "../_audit";

type RestoreBody = {
  mode?: "merge" | "replace";
  confirm?: string;
  backup?: {
    version?: string;
    exported_at?: string;
    tables?: Record<string, any[]>;
  };
};

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

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const actor = await requireAuth(env, request, "admin");
    const body = (await request.json().catch(() => ({}))) as RestoreBody;

    const mode = body.mode || "merge";
    const confirm = body.confirm || "";
    const expected = mode === "replace" ? "清空并恢复" : "恢复";
    requireConfirm(body as any, expected, "二次确认不通过");

    const tables = body.backup?.tables || {};
    if (!tables || typeof tables !== "object") {
      return Response.json({ ok: false, message: "备份数据为空" }, { status: 400 });
    }

    const verb = mode === "merge" ? "INSERT OR IGNORE" : "INSERT OR REPLACE";

    // D1 不支持 BEGIN/COMMIT：replace 模式用 batch 清空
    if (mode === "replace") {
      const del = DELETE_ORDER.map((t) => env.DB.prepare(`DELETE FROM ${t}`));
      await env.DB.batch(del);
    }

    let total = 0;
    for (const [table, rows] of Object.entries(tables)) {
      const cols = TABLE_COLUMNS[table];
      if (!cols) continue;
      if (!Array.isArray(rows) || rows.length === 0) continue;

      const placeholders = cols.map(() => "?").join(",");
      const sql = `${verb} INTO ${table} (${cols.join(",")}) VALUES (${placeholders})`;

      const stmts = rows.map((r) => env.DB.prepare(sql).bind(...pick(r, cols)));
      // 分批 batch，避免一次性太大
      const chunk = 50;
      for (let i = 0; i < stmts.length; i += chunk) {
        await env.DB.batch(stmts.slice(i, i + chunk));
      }
      total += rows.length;
    }

    logAudit(env.DB, request, actor, "ADMIN_RESTORE", "restore", "", {
      mode,
      total_rows: total,
      version: body.backup?.version || null,
      exported_at: body.backup?.exported_at || null,
    }).catch(() => {});

    return json(true, { ok: true, mode, total_rows: total });
  } catch (e: any) {
    return errorResponse(e);
  }
};
