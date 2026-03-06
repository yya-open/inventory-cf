import { json, requireAuth, errorResponse } from "../../_auth";
import { requireConfirm } from "../../_confirm";
import { logAudit } from "../_audit";
import { ensureCoreSchema } from "../_schema";
import { ensurePcSchema } from "../_pc";
import { ensureMonitorSchema } from "../_monitor";
import { DELETE_ORDER, INSERT_ORDER, TABLE_COLUMNS, pick, sniffGzipFromFile } from "./restore_job/_util";

type RestoreMode = "merge" | "replace";


async function readBackupText(file: File) {
  const isGz = await sniffGzipFromFile(file);
  if (isGz) {
    if (typeof (globalThis as any).DecompressionStream === "undefined") {
      throw new Error("当前环境不支持 gzip 解压，请上传 .json 备份");
    }
    const ds = file.stream().pipeThrough(new DecompressionStream("gzip"));
    return await new Response(ds).text();
  }
  return await file.text();
}

// POST /api/admin/restore_upload
// multipart/form-data: file=<backup.json>, mode=merge|replace, confirm=...
export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request, waitUntil }) => {
  try {
    const actor = await requireAuth(env, request, "admin");
    await ensureCoreSchema(env.DB);
    await ensurePcSchema(env.DB);
    await ensureMonitorSchema(env.DB);

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

    const text = await readBackupText(file);
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
