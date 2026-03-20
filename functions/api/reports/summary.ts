import { errorResponse } from "../_auth";
import { sqlBjDate } from "../_time";
import { requireAuthWithDataScope } from "../services/data-scope";

function ymdInShanghai(offsetDays = 0) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  const ymd = `${get("year")}-${get("month")}-${get("day")}`;
  if (!offsetDays) return ymd;
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + offsetDays);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

async function firstNumber(db: D1Database, sql: string, binds: any[] = []) {
  const row = await db.prepare(sql).bind(...binds).first<any>().catch(() => ({ c: 0 }));
  return Number(row?.c || 0);
}

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const user = await requireAuthWithDataScope(env, request, "viewer");

    const url = new URL(request.url);
    const warehouse_id = Number(url.searchParams.get("warehouse_id") ?? 1);
    const days = Number(url.searchParams.get("days") ?? 30);
    const mode = (url.searchParams.get("mode") || "parts").toLowerCase();
    const to = url.searchParams.get("to") ?? ymdInShanghai(0);
    const from = url.searchParams.get("from") ?? ymdInShanghai(-(days - 1));
    const departmentScope = user.data_scope_type === 'department' ? String(user.data_scope_value || '').trim() : '';

    const stability = await (async () => {
      const [failed_async_jobs, error_5xx_last_24h, active_alert_count, lastBackupDrill, openDrill, overdueDrill] = await Promise.all([
        firstNumber(env.DB, `SELECT COUNT(*) AS c FROM async_jobs WHERE status='failed'`),
        firstNumber(env.DB, `SELECT COUNT(*) AS c FROM request_error_log WHERE created_at >= datetime('now','+8 hours','-1 day') AND status >= 500`),
        firstNumber(env.DB, `SELECT COUNT(*) AS c FROM async_jobs WHERE status IN ('failed','queued','running')`),
        env.DB.prepare(`SELECT drill_at, outcome FROM backup_drill_runs ORDER BY id DESC LIMIT 1`).first<any>().catch(() => null),
        firstNumber(env.DB, `SELECT COUNT(*) AS c FROM backup_drill_runs WHERE follow_up_status='open'`),
        firstNumber(env.DB, `SELECT COUNT(*) AS c FROM backup_drill_runs WHERE follow_up_status='open' AND rect_due_at IS NOT NULL AND date(rect_due_at) < date('now','+8 hours')`),
      ]);
      return {
        failed_async_jobs,
        error_5xx_last_24h,
        active_alert_count,
        last_backup_drill_at: lastBackupDrill?.drill_at || null,
        last_backup_drill_outcome: lastBackupDrill?.outcome || null,
        open_drill_issue_count: openDrill,
        overdue_drill_issue_count: overdueDrill,
      };
    })();

    const governance = await (async () => {
      const pcDeptJoin = departmentScope ? `LEFT JOIN pc_asset_latest_state s ON s.asset_id=a.id` : '';
      const pcDeptWhere = departmentScope ? `WHERE TRIM(COALESCE(s.current_department,''))=?` : '';
      const pcBind = departmentScope ? [departmentScope] : [];
      const monitorWhere = departmentScope ? `WHERE TRIM(COALESCE(a.department,''))=?` : '';
      const monitorBind = departmentScope ? [departmentScope] : [];
      const [archived_pc_count, archived_monitor_count, total_pc_count, total_monitor_count, archive_events_30d, restore_events_30d, purge_events_30d] = await Promise.all([
        firstNumber(env.DB, `SELECT COUNT(*) AS c FROM pc_assets a ${pcDeptJoin} ${pcDeptWhere ? `${pcDeptWhere} AND COALESCE(a.archived,0)=1` : `WHERE COALESCE(a.archived,0)=1`}`, pcBind),
        firstNumber(env.DB, `SELECT COUNT(*) AS c FROM monitor_assets a ${monitorWhere ? `${monitorWhere} AND COALESCE(a.archived,0)=1` : `WHERE COALESCE(a.archived,0)=1`}`, monitorBind),
        firstNumber(env.DB, `SELECT COUNT(*) AS c FROM pc_assets a ${pcDeptJoin} ${pcDeptWhere}`, pcBind),
        firstNumber(env.DB, `SELECT COUNT(*) AS c FROM monitor_assets a ${monitorWhere}`, monitorBind),
        firstNumber(env.DB, `SELECT COUNT(*) AS c FROM audit_log WHERE action IN ('PC_ASSET_ARCHIVE','MONITOR_ASSET_ARCHIVE') AND ${sqlBjDate('created_at')} BETWEEN date(?) AND date(?)`, [from, to]),
        firstNumber(env.DB, `SELECT COUNT(*) AS c FROM audit_log WHERE action IN ('PC_ASSET_RESTORE','MONITOR_ASSET_RESTORE') AND ${sqlBjDate('created_at')} BETWEEN date(?) AND date(?)`, [from, to]),
        firstNumber(env.DB, `SELECT COUNT(*) AS c FROM audit_log WHERE action IN ('PC_ASSET_PURGE','MONITOR_ASSET_PURGE') AND ${sqlBjDate('created_at')} BETWEEN date(?) AND date(?)`, [from, to]),
      ]);
      return {
        archived_pc_count,
        archived_monitor_count,
        total_pc_count,
        total_monitor_count,
        archive_events_30d,
        restore_events_30d,
        purge_events_30d,
      };
    })();

    if (mode === 'parts' && departmentScope) {
      throw Object.assign(new Error(`当前账号的数据可见范围为部门：${departmentScope}，配件仓看板暂不支持按部门隔离，请切换到电脑仓看板`), { status: 403 });
    }

    if (mode === "pc") {
      const scopeJoin = departmentScope ? `JOIN pc_asset_latest_state s ON s.asset_id=t.asset_id` : '';
      const scopeWhere = departmentScope ? ` AND TRIM(COALESCE(s.current_department,''))=?` : '';
      const scopeBinds = departmentScope ? [departmentScope] : [];
      const sum = await env.DB.prepare(
        `SELECT
           (SELECT COUNT(*) FROM pc_in t ${scopeJoin} WHERE ${sqlBjDate("t.created_at")} BETWEEN date(?) AND date(?) ${scopeWhere}) AS in_qty,
           (SELECT COUNT(*) FROM pc_out t ${scopeJoin} WHERE ${sqlBjDate("t.created_at")} BETWEEN date(?) AND date(?) ${scopeWhere}) AS out_qty,
           (SELECT COUNT(*) FROM pc_recycle t ${scopeJoin} WHERE ${sqlBjDate("t.created_at")} BETWEEN date(?) AND date(?) ${scopeWhere}) AS recycle_qty,
           (SELECT COUNT(*) FROM pc_scrap t ${scopeJoin} WHERE ${sqlBjDate("t.created_at")} BETWEEN date(?) AND date(?) ${scopeWhere}) AS scrap_qty,
           (
             (SELECT COUNT(*) FROM pc_in t ${scopeJoin} WHERE ${sqlBjDate("t.created_at")} BETWEEN date(?) AND date(?) ${scopeWhere}) +
             (SELECT COUNT(*) FROM pc_out t ${scopeJoin} WHERE ${sqlBjDate("t.created_at")} BETWEEN date(?) AND date(?) ${scopeWhere}) +
             (SELECT COUNT(*) FROM pc_recycle t ${scopeJoin} WHERE ${sqlBjDate("t.created_at")} BETWEEN date(?) AND date(?) ${scopeWhere}) +
             (SELECT COUNT(*) FROM pc_scrap t ${scopeJoin} WHERE ${sqlBjDate("t.created_at")} BETWEEN date(?) AND date(?) ${scopeWhere})
           ) AS tx_count`
      )
      .bind(
        from, to, ...scopeBinds,
        from, to, ...scopeBinds,
        from, to, ...scopeBinds,
        from, to, ...scopeBinds,
        from, to, ...scopeBinds,
        from, to, ...scopeBinds,
        from, to, ...scopeBinds,
        from, to, ...scopeBinds,
      )
      .first() as any;

      const qTopPc = (table: string, whereExtra = "") => env.DB.prepare(
        `SELECT COALESCE(NULLIF(model,''),'(未填型号)') AS sku,
                COALESCE(NULLIF(brand,''),'') || CASE WHEN brand IS NOT NULL AND brand<>'' THEN ' · ' ELSE '' END || COALESCE(NULLIF(serial_no,''),'(无SN)') AS name,
                COUNT(*) AS qty
         FROM ${table} t ${scopeJoin}
         WHERE ${sqlBjDate("t.created_at")} BETWEEN date(?) AND date(?) ${scopeWhere} ${whereExtra}
         GROUP BY COALESCE(NULLIF(model,''),'(未填型号)'), COALESCE(NULLIF(brand,''),''), COALESCE(NULLIF(serial_no,''),'(无SN)')
         ORDER BY qty DESC, MAX(created_at) DESC
         LIMIT 10`
      );
      const qDailyPc = (table: string, whereExtra = "") => env.DB.prepare(
        `SELECT ${sqlBjDate("t.created_at")} AS day, COUNT(*) AS qty
         FROM ${table} t ${scopeJoin}
         WHERE ${sqlBjDate("t.created_at")} BETWEEN date(?) AND date(?) ${scopeWhere} ${whereExtra}
         GROUP BY day ORDER BY day ASC`
      );
      const qCatPc = (table: string, catExpr: string, whereExtra = "") => env.DB.prepare(
        `SELECT ${catExpr} AS category, COUNT(*) AS qty
         FROM ${table} t ${scopeJoin}
         WHERE ${sqlBjDate("t.created_at")} BETWEEN date(?) AND date(?) ${scopeWhere} ${whereExtra}
         GROUP BY category ORDER BY qty DESC LIMIT 20`
      );

      const { results: topOut } = await qTopPc("pc_out").bind(from, to, ...scopeBinds).all();
      const { results: topIn } = await qTopPc("pc_in").bind(from, to, ...scopeBinds).all();
      const { results: topReturn } = await qTopPc("pc_recycle", "AND UPPER(COALESCE(action,''))='RETURN'").bind(from, to, ...scopeBinds).all();
      const { results: topRecycle } = await qTopPc("pc_recycle", "AND UPPER(COALESCE(action,''))='RECYCLE'").bind(from, to, ...scopeBinds).all();
      const { results: topScrap } = await qTopPc("pc_scrap").bind(from, to, ...scopeBinds).all();

      const { results: dailyOut } = await qDailyPc("pc_out").bind(from, to, ...scopeBinds).all();
      const { results: dailyIn } = await qDailyPc("pc_in").bind(from, to, ...scopeBinds).all();
      const { results: dailyReturn } = await qDailyPc("pc_recycle", "AND UPPER(COALESCE(action,''))='RETURN'").bind(from, to, ...scopeBinds).all();
      const { results: dailyRecycle } = await qDailyPc("pc_recycle", "AND UPPER(COALESCE(action,''))='RECYCLE'").bind(from, to, ...scopeBinds).all();
      const { results: dailyScrap } = await qDailyPc("pc_scrap").bind(from, to, ...scopeBinds).all();

      const { results: catOut } = await qCatPc("pc_out", "COALESCE(NULLIF(t.department,''),'未填部门')").bind(from, to, ...scopeBinds).all();
      const { results: catIn } = await qCatPc("pc_in", "COALESCE(NULLIF(t.brand,''),'未填品牌')").bind(from, to, ...scopeBinds).all();
      const { results: catReturn } = await qCatPc("pc_recycle", "COALESCE(NULLIF(t.department,''),'未填部门')", "AND UPPER(COALESCE(t.action,''))='RETURN'").bind(from, to, ...scopeBinds).all();
      const { results: catRecycle } = await qCatPc("pc_recycle", "COALESCE(NULLIF(t.department,''),'未填部门')", "AND UPPER(COALESCE(t.action,''))='RECYCLE'").bind(from, to, ...scopeBinds).all();
      const { results: catScrap } = await qCatPc("pc_scrap", "COALESCE(NULLIF(t.reason,''),'未填原因')").bind(from, to, ...scopeBinds).all();

      return Response.json({
        ok: true,
        mode: "pc",
        range: { from, to, days },
        scope: { data_scope_type: user.data_scope_type || 'all', data_scope_value: user.data_scope_value || null },
        summary: {
          in_qty: Number(sum?.in_qty ?? 0),
          out_qty: Number(sum?.out_qty ?? 0),
          recycle_qty: Number(sum?.recycle_qty ?? 0),
          scrap_qty: Number(sum?.scrap_qty ?? 0),
          adjust_qty: Number(sum?.recycle_qty ?? 0),
          tx_count: Number(sum?.tx_count ?? 0),
        },
        governance,
        stability,
        top_out: topOut,
        top_in: topIn,
        top_return: topReturn,
        top_recycle: topRecycle,
        top_scrap: topScrap,
        daily_out: dailyOut,
        daily_in: dailyIn,
        daily_return: dailyReturn,
        daily_recycle: dailyRecycle,
        daily_scrap: dailyScrap,
        category_out: catOut,
        category_in: catIn,
        category_return: catReturn,
        category_recycle: catRecycle,
        category_scrap: catScrap,
      });
    }

    const sum = await env.DB.prepare(
      `SELECT
         SUM(CASE WHEN type='IN' THEN qty ELSE 0 END) AS in_qty,
         SUM(CASE WHEN type='OUT' THEN qty ELSE 0 END) AS out_qty,
         SUM(CASE WHEN type='ADJUST' THEN qty ELSE 0 END) AS adjust_qty,
         COUNT(*) AS tx_count
       FROM stock_tx
       WHERE warehouse_id=? AND ${sqlBjDate("created_at")} BETWEEN date(?) AND date(?)`
    ).bind(warehouse_id, from, to).first() as any;

    const { results: topOut } = await env.DB.prepare(
      `SELECT i.sku, i.name, SUM(t.qty) AS qty
       FROM stock_tx t JOIN items i ON i.id=t.item_id
       WHERE t.warehouse_id=? AND t.type='OUT' AND ${sqlBjDate("t.created_at")} BETWEEN date(?) AND date(?)
       GROUP BY t.item_id
       ORDER BY qty DESC
       LIMIT 10`
    ).bind(warehouse_id, from, to).all();

    const { results: topIn } = await env.DB.prepare(
      `SELECT i.sku, i.name, SUM(t.qty) AS qty
       FROM stock_tx t JOIN items i ON i.id=t.item_id
       WHERE t.warehouse_id=? AND t.type='IN' AND ${sqlBjDate("t.created_at")} BETWEEN date(?) AND date(?)
       GROUP BY t.item_id
       ORDER BY qty DESC
       LIMIT 10`
    ).bind(warehouse_id, from, to).all();

    const { results: dailyOut } = await env.DB.prepare(
      `SELECT ${sqlBjDate("created_at")} AS day, SUM(qty) AS qty
       FROM stock_tx
       WHERE warehouse_id=? AND type='OUT' AND ${sqlBjDate("created_at")} BETWEEN date(?) AND date(?)
       GROUP BY day
       ORDER BY day ASC`
    ).bind(warehouse_id, from, to).all();

    const { results: dailyIn } = await env.DB.prepare(
      `SELECT ${sqlBjDate("created_at")} AS day, SUM(qty) AS qty
       FROM stock_tx
       WHERE warehouse_id=? AND type='IN' AND ${sqlBjDate("created_at")} BETWEEN date(?) AND date(?)
       GROUP BY day
       ORDER BY day ASC`
    ).bind(warehouse_id, from, to).all();

    const { results: catOut } = await env.DB.prepare(
      `SELECT COALESCE(i.category,'未分类') AS category, SUM(t.qty) AS qty
       FROM stock_tx t JOIN items i ON i.id=t.item_id
       WHERE t.warehouse_id=? AND t.type='OUT' AND ${sqlBjDate("t.created_at")} BETWEEN date(?) AND date(?)
       GROUP BY category
       ORDER BY qty DESC
       LIMIT 20`
    ).bind(warehouse_id, from, to).all();

    const { results: catIn } = await env.DB.prepare(
      `SELECT COALESCE(i.category,'未分类') AS category, SUM(t.qty) AS qty
       FROM stock_tx t JOIN items i ON i.id=t.item_id
       WHERE t.warehouse_id=? AND t.type='IN' AND ${sqlBjDate("t.created_at")} BETWEEN date(?) AND date(?)
       GROUP BY category
       ORDER BY qty DESC
       LIMIT 20`
    ).bind(warehouse_id, from, to).all();

    return Response.json({
      ok: true,
      mode: "parts",
      range: { from, to, days },
      scope: { data_scope_type: user.data_scope_type || 'all', data_scope_value: user.data_scope_value || null },
      summary: {
        in_qty: Number(sum?.in_qty ?? 0),
        out_qty: Number(sum?.out_qty ?? 0),
        adjust_qty: Number(sum?.adjust_qty ?? 0),
        tx_count: Number(sum?.tx_count ?? 0),
      },
      governance,
      stability,
      top_out: topOut,
      top_in: topIn,
      daily_out: dailyOut,
      daily_in: dailyIn,
      category_out: catOut,
      category_in: catIn,
    });
  } catch (e:any) {
    return errorResponse(e);
  }
};
