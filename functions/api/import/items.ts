import { json, requireAuth, errorResponse } from '../_auth';
import { createItem, parseItemInput, updateItem } from '../services/inventory';

type ItemRow = {
  sku: string;
  name: string;
  brand?: string;
  model?: string;
  category?: string;
  unit?: string;
  warning_qty?: number;
};

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, 'admin');
    const body = await request.json<any>();
    const items: ItemRow[] = Array.isArray(body.items) ? body.items : [];
    const mode = (body.mode || 'upsert') as 'upsert' | 'skip' | 'overwrite';

    if (!items.length) return json(false, null, '没有可导入的数据', 400);

    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    const errors: any[] = [];

    try {
      for (let i = 0; i < items.length; i++) {
        const raw = items[i];
        let input;
        try {
          input = parseItemInput(raw);
        } catch (e: any) {
          errors.push({ row: i + 1, message: e?.message || 'SKU/名称必填' });
          skipped += 1;
          continue;
        }

        const exists = await env.DB.prepare('SELECT id FROM items WHERE sku=?').bind(input.sku).first<any>();
        if (exists && mode === 'skip') {
          skipped += 1;
          continue;
        }

        if (exists) {
          await updateItem(env.DB, Number(exists.id), input);
          updated += 1;
        } else {
          await createItem(env.DB, input);
          inserted += 1;
        }
      }
    } catch (e: any) {
      return json(false, null, '导入失败：' + (e?.message || 'unknown'), 500);
    }

    return json(true, { inserted, updated, skipped, errors });
  } catch (e: any) {
    return errorResponse(e);
  }
};
