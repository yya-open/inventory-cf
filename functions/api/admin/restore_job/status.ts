import { requireAuth, errorResponse, json } from "../../../_auth";

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, "admin");
    const url = new URL(request.url);
    const id = String(url.searchParams.get("id") || "").trim();
    if (!id) return Response.json({ ok: false, message: "缺少 id" }, { status: 400 });

    const job = await env.DB.prepare(`SELECT * FROM restore_job WHERE id=?`).bind(id).first<any>();
    if (!job) return Response.json({ ok: false, message: "任务不存在" }, { status: 404 });

    // Parse json fields safely
    let cursor: any = {};
    let perTable: any = {};
    try { cursor = JSON.parse(job.cursor_json || "{}"); } catch {}
    try { perTable = JSON.parse(job.per_table_json || "{}"); } catch {}

    return json(true, {
      id: job.id,
      status: job.status,
      stage: job.stage,
      mode: job.mode,
      filename: job.filename,
      total_rows: Number(job.total_rows || 0),
      processed_rows: Number(job.processed_rows || 0),
      current_table: job.current_table || null,
      per_table: perTable,
      cursor,
      replaced_done: Number(job.replaced_done || 0),
      error_count: Number(job.error_count || 0),
      last_error: job.last_error || null,
      created_at: job.created_at,
      updated_at: job.updated_at,
    });
  } catch (e: any) {
    return errorResponse(e);
  }
};
