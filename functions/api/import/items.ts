import { json, requireAuth } from '../_auth';
import { withErrorHandling } from '../_error';
import { parseItemInput } from '../services/inventory';
import { ensureItemCategorySchema, normalizeCategoryName } from '../services/item-categories';
import { resolveItemsBySkuOrAlias } from '../services/item-sku-aliases';
import { sqlNowStored } from '../_time';

type ItemRow = {
  sku: string;
  name: string;
  brand?: string;
  model?: string;
  category?: string;
  unit?: string;
  warning_qty?: number;
};

export const onRequestPost = withErrorHandling<{ DB: D1Database; JWT_SECRET: string }>(async ({ env, request }) => {
  await requireAuth(env, request, 'admin');
  const body = await request.json();
  const items: ItemRow[] = Array.isArray(body.items) ? body.items : [];
  const mode = (body.mode || 'upsert') as 'upsert' | 'skip' | 'overwrite';

  if (!items.length) return json(false, null, '没有可导入的数据', 400);

  const parsed: Array<{ index: number; input: ReturnType<typeof parseItemInput> }> = [];
  const errors: any[] = [];
  let skipped = 0;

  for (let i = 0; i < items.length; i++) {
    try {
      parsed.push({ index: i, input: parseItemInput(items[i]) });
    } catch (e: any) {
      errors.push({ row: i + 1, message: e?.message || 'SKU/名称必填' });
      skipped += 1;
    }
  }

  if (!parsed.length) return json(true, { inserted: 0, updated: 0, skipped, errors });

  await ensureItemCategorySchema(env.DB);

  // Batch-resolve categories (one round-trip instead of N)
  const uniqueCategories = [...new Set(
    parsed.map(p => normalizeCategoryName(p.input.category)).filter(Boolean)
  )] as string[];
  const categoryMap = new Map<string, { id: number | null; name: string }>();

  if (uniqueCategories.length) {
    const catResults = await env.DB.batch(
      uniqueCategories.map(name =>
        env.DB.prepare('SELECT id, name FROM item_categories WHERE name=? LIMIT 1').bind(name)
      )
    );

    const missingCategories: string[] = [];
    for (let i = 0; i < uniqueCategories.length; i++) {
      const row = (catResults[i] as any)?.results?.[0];
      if (row?.id) {
        categoryMap.set(uniqueCategories[i], { id: Number(row.id), name: String(row.name) });
      } else {
        missingCategories.push(uniqueCategories[i]);
      }
    }

    if (missingCategories.length) {
      await env.DB.batch(
        missingCategories.map(name =>
          env.DB.prepare(
            `INSERT OR IGNORE INTO item_categories (name, enabled, created_at, updated_at) VALUES (?, 1, ${sqlNowStored()}, ${sqlNowStored()})`
          ).bind(name)
        )
      );
      const refetchResults = await env.DB.batch(
        missingCategories.map(name =>
          env.DB.prepare('SELECT id, name FROM item_categories WHERE name=? LIMIT 1').bind(name)
        )
      );
      for (let i = 0; i < missingCategories.length; i++) {
        const row = (refetchResults[i] as any)?.results?.[0];
        if (row?.id) {
          categoryMap.set(missingCategories[i], { id: Number(row.id), name: String(row.name) });
        }
      }
    }
  }

  const skuMatches = await resolveItemsBySkuOrAlias(env.DB, parsed.map((p) => p.input.sku));

  // Build write batch (one round-trip instead of N)
  let inserted = 0;
  let updated = 0;
  const writeStmts: D1PreparedStatement[] = [];

  for (let i = 0; i < parsed.length; i++) {
    const { input } = parsed[i];
    const existingRow = skuMatches.get(input.sku);
    const catName = normalizeCategoryName(input.category);
    const cat = catName ? categoryMap.get(catName) : null;
    const categoryId = cat?.id ?? null;
    const categoryName = cat?.name ?? catName ?? null;

    if (existingRow?.id && mode === 'skip') {
      skipped += 1;
      continue;
    }

    if (existingRow?.id) {
      writeStmts.push(
        env.DB.prepare(
          'UPDATE items SET name=?, brand=?, model=?, category=?, category_id=?, unit=?, warning_qty=?, enabled=1 WHERE id=?'
        ).bind(input.name, input.brand, input.model, categoryName, categoryId, input.unit, input.warning_qty, Number(existingRow.id))
      );
      updated += 1;
    } else {
      writeStmts.push(
        env.DB.prepare(
          `INSERT INTO items (sku, name, brand, model, category, category_id, unit, warning_qty, created_at) VALUES (?,?,?,?,?,?,?,?, ${sqlNowStored()})`
        ).bind(input.sku, input.name, input.brand, input.model, categoryName, categoryId, input.unit, input.warning_qty)
      );
      inserted += 1;
    }
  }

  if (writeStmts.length) {
    await env.DB.batch(writeStmts);
  }

  return json(true, { inserted, updated, skipped, errors });
});
