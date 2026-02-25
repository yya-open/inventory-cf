import { errorResponse, json } from '../../_auth';
import { requirePermission } from '../_permissions';
import { ensurePcSchema } from '../_pc';

type Severity = 'error' | 'warn' | 'info';

type Issue = {
  severity: Severity;
  type: string;
  table?: string;
  column?: string;
  message: string;
};

const TABLE_COLUMNS: Record<string, string[]> = {
  warehouses: ['id','name','created_at'],
  items: ['id','sku','name','brand','model','category','unit','warning_qty','enabled','created_at'],
  stock: ['id','item_id','warehouse_id','qty','updated_at'],
  stock_tx: ['id','tx_no','type','item_id','warehouse_id','qty','delta_qty','ref_type','ref_id','ref_no','unit_price','source','target','remark','created_at','created_by'],
  users: ['id','username','password_hash','role','is_active','must_change_password','created_at'],
  auth_login_throttle: ['id','ip','username','fail_count','first_fail_at','last_fail_at','locked_until','updated_at'],
  audit_log: ['id','user_id','username','action','entity','entity_id','payload_json','ip','ua','created_at'],
  stocktake: ['id','st_no','warehouse_id','status','created_at','created_by','applied_at'],
  stocktake_line: ['id','stocktake_id','item_id','system_qty','counted_qty','diff_qty','updated_at'],
  pc_assets: ['id','brand','serial_no','model','manufacture_date','warranty_end','disk_capacity','memory_size','remark','status','created_at','updated_at'],
  pc_in: ['id','in_no','asset_id','brand','serial_no','model','manufacture_date','warranty_end','disk_capacity','memory_size','remark','created_at','created_by'],
  pc_out: ['id','out_no','asset_id','employee_no','department','employee_name','is_employed','brand','serial_no','model','config_date','manufacture_date','warranty_end','disk_capacity','memory_size','remark','recycle_date','created_at','created_by'],
  pc_recycle: ['id','recycle_no','action','asset_id','employee_no','department','employee_name','is_employed','brand','serial_no','model','recycle_date','remark','created_at','created_by'],
  pc_scrap: ['id','scrap_no','asset_id','brand','serial_no','model','manufacture_date','warranty_end','disk_capacity','memory_size','remark','scrap_date','reason','created_at','created_by'],
};

function isGzipMagicBytes(bytes?: Uint8Array | null) {
  return !!bytes && bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}
async function sniffGzipFromFile(file: File) {
  try {
    const ab = await file.slice(0, 2).arrayBuffer();
    return isGzipMagicBytes(new Uint8Array(ab));
  } catch {
    const n = String((file as any)?.name || '').toLowerCase();
    return n.endsWith('.gz') || n.endsWith('.gzip');
  }
}
async function readBackupText(file: File) {
  const isGz = await sniffGzipFromFile(file);
  if (isGz) {
    if (typeof (globalThis as any).DecompressionStream === 'undefined') {
      throw new Error('当前环境不支持 gzip 解压，请上传 .json 备份');
    }
    const ds = file.stream().pipeThrough(new DecompressionStream('gzip'));
    return await new Response(ds).text();
  }
  return await file.text();
}

async function dbColumns(db: D1Database, table: string): Promise<string[] | null> {
  try {
    const rows = await db.prepare(`PRAGMA table_info(${table})`).all<any>();
    const list = (rows?.results || [])
      .map((r: any) => String(r?.name || '').trim())
      .filter(Boolean);
    return list.length ? list : null;
  } catch {
    return null;
  }
}

function sampleRowColumns(rows: any[] | undefined): string[] {
  if (!Array.isArray(rows) || !rows.length) return [];
  const set = new Set<string>();
  for (let i = 0; i < rows.length && i < 20; i++) {
    const r = rows[i];
    if (r && typeof r === 'object' && !Array.isArray(r)) {
      for (const k of Object.keys(r)) set.add(k);
    }
  }
  return [...set];
}

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, 'admin');
    await ensurePcSchema(env.DB);

    const ct = request.headers.get('content-type') || '';
    if (!ct.includes('multipart/form-data')) {
      return Response.json({ ok: false, message: '请使用 multipart/form-data 上传备份文件' }, { status: 400 });
    }

    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return Response.json({ ok: false, message: '缺少 file' }, { status: 400 });
    }

    const text = await readBackupText(file);
    const backup = JSON.parse(text || '{}');
    const tables = backup?.tables || {};
    if (!tables || typeof tables !== 'object') {
      return Response.json({ ok: false, message: '备份数据为空或格式不正确' }, { status: 400 });
    }

    const issues: Issue[] = [];
    const backupTableNames = Object.keys(tables);
    const supported = new Set(Object.keys(TABLE_COLUMNS));

    for (const t of backupTableNames) {
      if (!supported.has(t)) {
        issues.push({ severity: 'warn', type: 'unsupported_backup_table', table: t, message: `备份中包含未识别表：${t}（将被忽略）` });
      }
    }

    for (const [t, expectedCols] of Object.entries(TABLE_COLUMNS)) {
      const rows = (tables as any)[t] as any[] | undefined;
      const backupHasTable = Object.prototype.hasOwnProperty.call(tables, t);
      if (!backupHasTable) {
        issues.push({ severity: 'info', type: 'backup_table_missing', table: t, message: `备份中未包含表：${t}` });
      }

      const actualCols = await dbColumns(env.DB, t);
      if (!actualCols) {
        issues.push({ severity: 'error', type: 'db_table_missing', table: t, message: `当前数据库缺少表：${t}` });
        continue;
      }

      const actualSet = new Set(actualCols);
      for (const c of expectedCols) {
        if (!actualSet.has(c)) {
          issues.push({ severity: 'error', type: 'db_column_missing', table: t, column: c, message: `当前数据库表 ${t} 缺少字段：${c}` });
        }
      }

      if (backupHasTable) {
        const backupCols = sampleRowColumns(rows);
        const expectedSet = new Set(expectedCols);
        for (const c of backupCols) {
          if (!expectedSet.has(c)) {
            issues.push({ severity: 'warn', type: 'backup_extra_column', table: t, column: c, message: `备份表 ${t} 含额外字段：${c}（恢复时将忽略）` });
          }
          if (!actualSet.has(c)) {
            issues.push({ severity: 'warn', type: 'db_missing_backup_column', table: t, column: c, message: `备份表 ${t} 的字段 ${c} 在当前数据库中不存在（该字段数据将无法恢复）` });
          }
        }
      }
    }

    const counts = { error: 0, warn: 0, info: 0 };
    for (const i of issues) (counts as any)[i.severity]++;

    const backupRowsByTable: Record<string, number> = {};
    for (const k of backupTableNames) {
      const rows = (tables as any)[k];
      backupRowsByTable[k] = Array.isArray(rows) ? rows.length : 0;
    }

    return json(true, {
      valid: counts.error === 0,
      counts,
      issues,
      backup_summary: {
        version: backup?.version || null,
        exported_at: backup?.exported_at || null,
        tables: backupTableNames,
        rows_by_table: backupRowsByTable,
      },
    });
  } catch (e: any) {
    return errorResponse(e);
  }
};
