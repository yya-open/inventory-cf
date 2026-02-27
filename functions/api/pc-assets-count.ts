import { requireAuth, errorResponse } from "../_auth";
import { ensurePcSchema } from "./_pc";
import { buildKeywordWhere } from "./_search";

// 专门用于“只统计 total”的轻量接口：前端列表首屏可用 fast=1 跳过 COUNT(*)，
// 然后异步请求该接口补齐 total，显著提升首屏速度。
export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, "viewer");
    if (!env.DB) return Response.json({ ok: false, message: "未绑定 D1 数据库(DB)" }, { status: 500 });
    await ensurePcSchema(env.DB);

    const url = new URL(request.url);
    const status = (url.searchParams.get("status") || "").trim();
    const keyword = (url.searchParams.get("keyword") || "").trim();
    const ageYears = Math.max(0, Number(url.searchParams.get("age_years") || 0));

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
    const row = await env.DB.prepare(`SELECT COUNT(*) as c FROM pc_assets a ${where}`).bind(...binds).first<any>();
    return Response.json({ ok: true, total: Number(row?.c || 0) });
  } catch (e: any) {
    return errorResponse(e);
  }
};
