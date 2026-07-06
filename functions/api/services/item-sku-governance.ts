import { generateItemSkuFromUsed } from './inventory';

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

const AUTO_SKU_RE = /^[A-Z0-9]+(?:-[A-Z0-9]+)*-\d{8}-\d{3}$/;
const BASIC_SKU_RE = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

function hasUnsupportedChars(sku: string) {
  return /[^A-Za-z0-9-]/.test(sku);
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

export async function scanItemSkuGovernance(db: D1Database, options: { severity?: string; limit?: number } = {}) {
  const limit = Math.min(1000, Math.max(20, Math.trunc(Number(options.limit || 500)) || 500));
  const rows = (await db.prepare(
    `SELECT id, sku, name, brand, model, category, unit
       FROM items
      WHERE enabled=1
      ORDER BY id ASC`
  ).all<any>()).results || [];

  const usedSkus = new Set(rows.map((row: any) => String(row?.sku || '').trim()).filter(Boolean));
  const items: SkuGovernanceItem[] = [];
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
    if (items.length < limit) items.push(item);
  }

  return { items, summary, limit };
}

export function normalizeSkuUpdateInput(input: any) {
  const id = Math.trunc(Number(input?.id || 0));
  const oldSku = String(input?.old_sku ?? input?.sku ?? '').trim();
  const newSku = String(input?.new_sku ?? input?.suggested_sku ?? '').trim();
  return { id, oldSku, newSku };
}

export function validateGovernanceSku(sku: string) {
  if (!sku) return '新 SKU 不能为空';
  if (sku.length > 64) return '新 SKU 不能超过 64 个字符';
  if (!BASIC_SKU_RE.test(sku)) return '新 SKU 只能包含大写字母、数字和短横线，且不能以短横线开头或结尾';
  return null;
}
