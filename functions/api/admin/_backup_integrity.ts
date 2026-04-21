import { BACKUP_VERSION, LEGACY_BACKUP_VERSIONS, SCHEMA_VERSION, TABLE_BY_NAME, TABLE_COLUMNS } from './_backup_schema';

export type BackupManifestTable = {
  group: string;
  group_label: string;
  label: string;
  columns: string[];
  rows: number;
};

export type BackupManifest = {
  backup_version: string;
  schema_version: number;
  exported_at: string;
  generated_by: string | null;
  actor: string | null;
  reason: string | null;
  filters: Record<string, any> | null;
  table_order: string[];
  table_count: number;
  total_rows: number;
  tables: Record<string, BackupManifestTable>;
};

export type BackupIntegrityTable = {
  rows: number;
  row_chain_sha256: string;
};

export type BackupIntegrity = {
  manifest_sha256: string;
  total_rows: number;
  table_count: number;
  tables: Record<string, BackupIntegrityTable>;
  table_chain_sha256: string;
};

export type BackupValidationIssue = {
  severity: 'error' | 'warn' | 'info';
  type: string;
  table?: string;
  message: string;
};

export type BackupValidationResult = {
  ok: boolean;
  version: string | null;
  issues: BackupValidationIssue[];
  manifest: BackupManifest | null;
  integrity: BackupIntegrity | null;
  tableOrder: string[];
  actualRowCounts: Record<string, number>;
  recomputedIntegrity: BackupIntegrity | null;
};

const encoder = new TextEncoder();

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string | null | undefined) {
  const raw = String(hex || '').trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(raw)) return null;
  const out = new Uint8Array(raw.length / 2);
  for (let i = 0; i < raw.length; i += 2) out[i / 2] = Number.parseInt(raw.slice(i, i + 2), 16);
  return out;
}

function concatBytes(parts: Uint8Array[]) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function partToBytes(part: Uint8Array | string) {
  return typeof part === 'string' ? encoder.encode(part) : part;
}

async function sha256Bytes(parts: Array<Uint8Array | string>) {
  if (!globalThis.crypto?.subtle) throw new Error('当前环境不支持 crypto.subtle，无法计算 SHA-256');
  const bytes = concatBytes(parts.map(partToBytes));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return new Uint8Array(digest);
}

export async function chainSha256(prev: Uint8Array | null | undefined, parts: Array<Uint8Array | string>) {
  const rawParts: Uint8Array[] = [];
  if (prev?.length) rawParts.push(prev);
  for (const part of parts) rawParts.push(partToBytes(part));
  return sha256Bytes(rawParts);
}

export async function sha256JsonHex(value: any) {
  return bytesToHex(await sha256Bytes([JSON.stringify(value)]));
}

async function computeTableRowChain(rows: any[]) {
  let state: Uint8Array | null = null;
  let rowCount = 0;
  for (const row of rows) {
    rowCount += 1;
    state = await chainSha256(state, [JSON.stringify(row)]);
  }
  const finalState = state || await sha256Bytes(['']);
  return { rows: rowCount, row_chain_sha256: bytesToHex(finalState) } satisfies BackupIntegrityTable;
}

export async function computeBackupIntegrity(tablePayload: Record<string, any[]>, tableOrder?: string[]) {
  const order = Array.isArray(tableOrder) && tableOrder.length ? tableOrder : Object.keys(tablePayload || {});
  const tables: Record<string, BackupIntegrityTable> = {};
  let tableChainState: Uint8Array | null = null;
  let totalRows = 0;
  for (const table of order) {
    const rows = Array.isArray(tablePayload?.[table]) ? tablePayload[table] : [];
    const entry = await computeTableRowChain(rows);
    tables[table] = entry;
    totalRows += Number(entry.rows || 0);
    tableChainState = await chainSha256(tableChainState, [table, ':', String(entry.rows), ':', entry.row_chain_sha256]);
  }
  const tableChain = tableChainState || await sha256Bytes(['']);
  return {
    total_rows: totalRows,
    table_count: order.length,
    tables,
    table_chain_sha256: bytesToHex(tableChain),
  };
}

export function buildBackupManifest(args: {
  exportedAt: string;
  tableOrder: string[];
  rowCounts: Record<string, number>;
  actor?: string | null;
  reason?: string | null;
  filters?: Record<string, any> | null;
  generatedBy?: string | null;
}) {
  const tableOrder = Array.isArray(args.tableOrder) ? args.tableOrder : [];
  const tables: Record<string, BackupManifestTable> = {};
  let totalRows = 0;
  for (const table of tableOrder) {
    const def = TABLE_BY_NAME[table];
    const rows = Number(args.rowCounts?.[table] || 0);
    totalRows += rows;
    tables[table] = {
      group: def?.group || 'core',
      group_label: def?.group === 'pc' ? '电脑仓' : def?.group === 'monitor' ? '显示器' : def?.group === 'system' ? '系统表' : '基础表',
      label: def?.label || table,
      columns: TABLE_COLUMNS[table] || [],
      rows,
    };
  }
  return {
    backup_version: BACKUP_VERSION,
    schema_version: SCHEMA_VERSION,
    exported_at: args.exportedAt,
    generated_by: args.generatedBy || 'manual',
    actor: args.actor || null,
    reason: args.reason || null,
    filters: args.filters || null,
    table_order: tableOrder,
    table_count: tableOrder.length,
    total_rows: totalRows,
    tables,
  } satisfies BackupManifest;
}

function isSupportedVersion(version: string | null | undefined) {
  const v = String(version || '').trim();
  return v === BACKUP_VERSION || LEGACY_BACKUP_VERSIONS.includes(v as any);
}

export async function validateBackupEnvelope(backup: any) {
  const issues: BackupValidationIssue[] = [];
  const version = String(backup?.version || backup?.meta?.backup_version || '').trim() || null;
  if (!version) {
    issues.push({ severity: 'error', type: 'backup_version_missing', message: '备份文件缺少 version 字段' });
  } else if (!isSupportedVersion(version)) {
    issues.push({ severity: 'error', type: 'backup_version_unsupported', message: `当前系统不支持备份版本：${version}` });
  }

  const tables = backup && typeof backup === 'object' && backup.tables && typeof backup.tables === 'object' ? backup.tables as Record<string, any[]> : {};
  const manifest = backup?.manifest && typeof backup.manifest === 'object' ? backup.manifest as BackupManifest : null;
  const integrity = backup?.integrity && typeof backup.integrity === 'object' ? backup.integrity as BackupIntegrity : null;
  const tableOrder = Array.isArray(manifest?.table_order) && manifest.table_order.length ? manifest.table_order : Object.keys(tables || {});
  const actualRowCounts = Object.fromEntries(tableOrder.map((table) => [table, Array.isArray(tables?.[table]) ? tables[table].length : 0]));

  let recomputedIntegrity: BackupIntegrity | null = null;

  if (version === BACKUP_VERSION) {
    if (!manifest) issues.push({ severity: 'error', type: 'backup_manifest_missing', message: 'v3 备份缺少 manifest' });
    if (!integrity) issues.push({ severity: 'error', type: 'backup_integrity_missing', message: 'v3 备份缺少 integrity' });
  } else if (!manifest) {
    issues.push({ severity: 'info', type: 'legacy_manifest_missing', message: '旧版备份未包含 manifest，将按兼容模式校验' });
  }

  if (manifest) {
    if (!Array.isArray(manifest.table_order) || manifest.table_order.length === 0) {
      issues.push({ severity: 'error', type: 'manifest_table_order_invalid', message: 'manifest.table_order 无效' });
    }
    for (const table of tableOrder) {
      const expected = Number(manifest.tables?.[table]?.rows || 0);
      const actual = Number(actualRowCounts[table] || 0);
      if (expected !== actual) {
        issues.push({ severity: 'error', type: 'manifest_row_count_mismatch', table, message: `表 ${table} 的 manifest 行数为 ${expected}，实际备份行为 ${actual}` });
      }
    }
  }

  if (integrity) {
    recomputedIntegrity = {
      manifest_sha256: manifest ? await sha256JsonHex(manifest) : '',
      ...(await computeBackupIntegrity(tables, tableOrder)),
    };
    if (manifest && integrity.manifest_sha256 !== recomputedIntegrity.manifest_sha256) {
      issues.push({ severity: 'error', type: 'manifest_sha256_mismatch', message: 'manifest_sha256 校验失败，备份元数据可能已被修改' });
    }
    if (Number(integrity.total_rows || 0) !== Number(recomputedIntegrity.total_rows || 0)) {
      issues.push({ severity: 'error', type: 'integrity_total_rows_mismatch', message: `integrity.total_rows=${Number(integrity.total_rows || 0)}，实际=${Number(recomputedIntegrity.total_rows || 0)}` });
    }
    if (Number(integrity.table_count || 0) !== Number(recomputedIntegrity.table_count || 0)) {
      issues.push({ severity: 'error', type: 'integrity_table_count_mismatch', message: `integrity.table_count=${Number(integrity.table_count || 0)}，实际=${Number(recomputedIntegrity.table_count || 0)}` });
    }
    if (String(integrity.table_chain_sha256 || '') !== String(recomputedIntegrity.table_chain_sha256 || '')) {
      issues.push({ severity: 'error', type: 'table_chain_sha256_mismatch', message: '表级 SHA-256 链校验失败，备份内容可能已损坏或被修改' });
    }
    for (const table of tableOrder) {
      const expected = integrity.tables?.[table];
      const actual = recomputedIntegrity.tables?.[table];
      if (!expected) {
        issues.push({ severity: 'error', type: 'integrity_table_missing', table, message: `integrity.tables 缺少 ${table}` });
        continue;
      }
      if (Number(expected.rows || 0) !== Number(actual?.rows || 0)) {
        issues.push({ severity: 'error', type: 'integrity_table_rows_mismatch', table, message: `表 ${table} 的 integrity 行数为 ${Number(expected.rows || 0)}，实际为 ${Number(actual?.rows || 0)}` });
      }
      if (String(expected.row_chain_sha256 || '') !== String(actual?.row_chain_sha256 || '')) {
        issues.push({ severity: 'error', type: 'integrity_table_sha256_mismatch', table, message: `表 ${table} 的 SHA-256 链校验失败` });
      }
    }
  } else if (version && LEGACY_BACKUP_VERSIONS.includes(version as any)) {
    issues.push({ severity: 'info', type: 'legacy_integrity_missing', message: '旧版备份未包含 integrity，将跳过 SHA-256 校验' });
  }

  return {
    ok: issues.every((issue) => issue.severity !== 'error'),
    version,
    issues,
    manifest,
    integrity,
    tableOrder,
    actualRowCounts,
    recomputedIntegrity,
  } satisfies BackupValidationResult;
}

export function normalizeStoredBackupManifest(raw: any) {
  if (!raw || typeof raw !== 'object') return null;
  return raw as BackupManifest;
}

export function normalizeStoredBackupIntegrity(raw: any) {
  if (!raw || typeof raw !== 'object') return null;
  return raw as BackupIntegrity;
}

export function parseSha256Hex(raw: string | null | undefined) {
  return hexToBytes(raw);
}
