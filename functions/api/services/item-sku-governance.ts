import { generateItemSkuFromUsed } from './inventory';
import { ensureItemSkuAliasSchema } from './item-sku-aliases';

export type SkuIssueSeverity = 'risk' | 'legacy';

export type SkuGovernanceItem = {
  id: number;
  sku: string;
  name: string;
  brand: string | null;
  model: string | null;
  category: string | null;
  unit: string | null;
  issues: string[];
  severity: SkuIssueSeverity;
  suggested_sku: string;
};

export type SkuUpdateInput = ReturnType<typeof normalizeSkuUpdateInput>;

const AUTO_SKU_RE = /^[A-Z0-9]+(?:-[A-Z0-9]+)*-\d{8}-\d{3}$/;
const BASIC_SKU_RE = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

function hasUnsupportedChars(sku: string) {
  return /[^A-Za-z0-9-]/.test(sku);
}

function likeKeyword(keyword: string) {
  return `%${keyword.replace(/[%_]/g, (ch) => `\\${ch}`)}%`;
}

export function analyzeItemSku(skuInput: unknown) {
  const raw = String(skuInput ?? '');
  const sku = raw.trim();
  const issues: string[] = [];
  let risk = false;

  if (!sku) {
    issues.push('SKU 为空');
    risk = true;
  }
  if (raw !== sku) {
    issues.push('首尾有空格');
    risk = true;
  }
  if (/[a-z]/.test(sku)) {
    issues.push('包含小写字母');
    risk = true;
  }
  if (hasUnsupportedChars(sku)) {
    issues.push('包含空格、中文或特殊符号');
    risk = true;
  }
  if (sku && sku.length < 3) {
    issues.push('长度过短');
    risk = true;
  }
  if (sku && !sku.includes('-')) {
    issues.push('缺少分段短横线');
    risk = true;
  }
  if (sku && !BASIC_SKU_RE.test(sku)) {
    issues.push('不符合大写字母/数字/短横线规则');
    risk = true;
  }
  if (sku && !AUTO_SKU_RE.test(sku)) {
    issues.push('不是系统自动编码格式');
  }

  return {
    normalized: sku,
    issues,
    severity: risk ? 'risk' as const : 'legacy' as const,
    isCompliant: issues.length === 0,
  };
}

function issueMatches(item: SkuGovernanceItem, issueType?: string | null) {
  if (!issueType || issueType === 'all') return true;
  const joined = item.issues.join('\n');
  if (issueType === 'lowercase') return joined.includes('小写');
  if (issueType === 'special') return joined.includes('特殊') || joined.includes('中文') || joined.includes('空格');
  if (issueType === 'short') return joined.includes('过短');
  if (issueType === 'no_dash') return joined.includes('短横线');
  if (issueType === 'legacy_format') return joined.includes('自动编码格式');
  return true;
}

function mapRow(row: any, usedSkus: Set<string>, now = new Date()): SkuGovernanceItem | null {
  const analysis = analyzeItemSku(row?.sku);
  if (analysis.isCompliant) return null;
  const item = {
    name: String(row?.name || ''),
    brand: row?.brand ? String(row.brand) : null,
    model: row?.model ? String(row.model) : null,
    category: row?.category ? String(row.category) : null,
  };
  const suggested = generateItemSkuFromUsed(item, usedSkus, now);
  usedSkus.add(suggested);
  return {
    id: Number(row.id),
    sku: String(row?.sku || ''),
    name: item.name,
    brand: item.brand,
    model: item.model,
    category: item.category,
    unit: row?.unit ? String(row.unit) : null,
    issues: analysis.issues,
    severity: analysis.severity,
    suggested_sku: suggested,
  };
}

export async function scanItemSkuGovernance(db: D1Database, options: {
  severity?: string;
  issueType?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
  limit?: number;
} = {}) {
  const page = Math.max(1, Math.trunc(Number(options.page || 1)) || 1);
  const pageSize = Math.min(200, Math.max(20, Math.trunc(Number(options.pageSize || options.limit || 50)) || 50));
  const keyword = String(options.keyword || '').trim();
  const wh = ['enabled=1'];
  const binds: any[] = [];
  if (keyword) {
    wh.push(`(sku LIKE ? ESCAPE '\\' OR name LIKE ? ESCAPE '\\' OR brand LIKE ? ESCAPE '\\' OR model LIKE ? ESCAPE '\\' OR category LIKE ? ESCAPE '\\')`);
    const kw = likeKeyword(keyword);
    binds.push(kw, kw, kw, kw, kw);
  }

  const rows = (await db.prepare(
    `SELECT id, sku, name, brand, model, category, unit
       FROM items
      WHERE ${wh.join(' AND ')}
      ORDER BY id ASC`
  ).bind(...binds).all<any>()).results || [];

  const allSkuRows = (await db.prepare(`SELECT sku FROM items WHERE enabled=1`).all<any>()).results || [];
  const usedSkus = new Set(allSkuRows.map((row: any) => String(row?.sku || '').trim()).filter(Boolean));
  const filtered: SkuGovernanceItem[] = [];
  const summary = { total: rows.length, compliant: 0, risk: 0, legacy: 0, suggested: 0 };

  for (const row of rows) {
    const item = mapRow(row, usedSkus);
    if (!item) {
      summary.compliant += 1;
      continue;
    }
    summary[item.severity] += 1;
    summary.suggested += 1;
    if (options.severity && options.severity !== 'all' && item.severity !== options.severity) continue;
    if (!issueMatches(item, options.issueType)) continue;
    filtered.push(item);
  }

  const total = filtered.length;
  const offset = (page - 1) * pageSize;
  return { items: filtered.slice(offset, offset + pageSize), summary, total, page, pageSize };
}

export function normalizeSkuUpdateInput(input: any) {
  const id = Math.trunc(Number(input?.id || 0));
  const oldSku = String(input?.old_sku ?? input?.sku ?? '').trim();
  const newSku = String(input?.new_sku ?? input?.suggested_sku ?? '').trim();
  const suggestedSku = String(input?.suggested_sku ?? '').trim();
  return { id, oldSku, newSku, suggestedSku };
}

export function validateGovernanceSku(sku: string) {
  if (!sku) return '新 SKU 不能为空';
  if (sku.length > 64) return '新 SKU 不能超过 64 个字符';
  if (!BASIC_SKU_RE.test(sku)) return '新 SKU 只能包含大写字母、数字和短横线，且不能以短横线开头或结尾';
  return null;
}

export async function precheckSkuGovernanceUpdates(db: D1Database, rawItems: any[]) {
  await ensureItemSkuAliasSchema(db);
  const items = (Array.isArray(rawItems) ? rawItems : []).map(normalizeSkuUpdateInput).filter((item) => item.id > 0);
  const report = {
    ok: true,
    total: items.length,
    valid_count: 0,
    manually_changed_count: 0,
    alias_to_create_count: 0,
    errors: [] as Array<{ code: string; message: string; item?: any }>,
    warnings: [] as Array<{ code: string; message: string; item?: any }>,
    items: [] as Array<SkuUpdateInput & { name?: string | null }>,
  };

  if (!items.length) {
    report.ok = false;
    report.errors.push({ code: 'empty', message: '没有有效的 SKU 映射' });
    return report;
  }
  if (items.length > 200) {
    report.ok = false;
    report.errors.push({ code: 'too_many', message: '单次最多处理 200 条 SKU 映射' });
    return report;
  }

  const idSet = new Set<number>();
  const newSkuSet = new Set<string>();
  for (const item of items) {
    if (idSet.has(item.id)) {
      report.errors.push({ code: 'duplicate_item', message: `物料 ${item.id} 重复提交`, item });
      continue;
    }
    idSet.add(item.id);
    const validation = validateGovernanceSku(item.newSku);
    if (validation) report.errors.push({ code: 'invalid_sku', message: validation, item });
    if (newSkuSet.has(item.newSku)) report.errors.push({ code: 'duplicate_new_sku', message: `新 SKU 重复：${item.newSku}`, item });
    newSkuSet.add(item.newSku);
    if (item.suggestedSku && item.suggestedSku !== item.newSku) report.manually_changed_count += 1;
    if (item.oldSku && item.oldSku !== item.newSku) report.alias_to_create_count += 1;
  }

  const ids = items.map((item) => item.id);
  const idPh = ids.map(() => '?').join(',');
  const currentRows = idPh
    ? (await db.prepare(`SELECT id, sku, name FROM items WHERE enabled=1 AND id IN (${idPh})`).bind(...ids).all<any>()).results || []
    : [];
  const currentById = new Map(currentRows.map((row: any) => [Number(row.id), row]));
  for (const item of items) {
    const current = currentById.get(item.id);
    if (!current) {
      report.errors.push({ code: 'missing_item', message: `物料不存在或已停用：${item.id}`, item });
      continue;
    }
    if (String(current.sku || '').trim() !== item.oldSku) {
      report.errors.push({ code: 'sku_changed', message: `物料 ${item.id} 的 SKU 已变化，请刷新后重试`, item: { ...item, current_sku: current.sku } });
      continue;
    }
    report.items.push({ ...item, name: current.name || null });
  }

  if (items.length) {
    const newSkus = items.map((item) => item.newSku);
    const skuPh = newSkus.map(() => '?').join(',');
    const existingItems = (await db.prepare(
      `SELECT id, sku FROM items WHERE enabled=1 AND sku IN (${skuPh}) AND id NOT IN (${idPh})`
    ).bind(...newSkus, ...ids).all<any>()).results || [];
    for (const row of existingItems as any[]) {
      report.errors.push({ code: 'sku_conflict_item', message: `新 SKU 已被物料 ${row.id} 使用：${row.sku}`, item: row });
    }

    const aliasRows = (await db.prepare(
      `SELECT item_id, alias_sku FROM item_sku_aliases WHERE active=1 AND alias_sku IN (${skuPh}) AND item_id NOT IN (${idPh})`
    ).bind(...newSkus, ...ids).all<any>()).results || [];
    for (const row of aliasRows as any[]) {
      report.errors.push({ code: 'sku_conflict_alias', message: `新 SKU 已作为物料 ${row.item_id} 的别名：${row.alias_sku}`, item: row });
    }
  }

  report.valid_count = report.items.length;
  report.ok = report.errors.length === 0;
  if (report.alias_to_create_count > 0) {
    report.warnings.push({ code: 'aliases_created', message: `应用后会自动创建 ${report.alias_to_create_count} 个旧 SKU 别名，旧模板可继续匹配。` });
  }
  if (report.manually_changed_count > 0) {
    report.warnings.push({ code: 'manual_changes', message: `${report.manually_changed_count} 条建议 SKU 被人工修改，请重点核对。` });
  }
  return report;
}
