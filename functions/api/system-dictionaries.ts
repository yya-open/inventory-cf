import { errorResponse, json, requireAuth } from './_auth';
import { logAudit } from './_audit';
import {
  createSystemDictionaryItem,
  deleteSystemDictionaryItem,
  getSystemDictionaryItemById,
  groupDictionaryItems,
  listSystemDictionaryItems,
  type SystemDictionaryKey,
} from './services/system-dictionaries';
import { updateSystemDictionaryItem } from './services/system-dictionaries';
import { requireConfirm } from '../_confirm';

type Env = { DB: D1Database; JWT_SECRET?: string };

function parseDictionaryKey(value: any) {
  const key = String(value || '').trim();
  return key ? (key as SystemDictionaryKey) : undefined;
}

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, 'viewer');
    const url = new URL(request.url);
    const dictionaryKey = parseDictionaryKey(url.searchParams.get('dictionary_key'));
    const items = await listSystemDictionaryItems(env.DB, dictionaryKey);
    return json(true, {
      items,
      grouped: groupDictionaryItems(items),
    });
  } catch (e: any) {
    return errorResponse(e);
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const user = await requireAuth(env, request, 'admin');
    const body = await request.json().catch(() => ({}));
    const item = await createSystemDictionaryItem(env.DB, body || {}, user.username || null);
    await logAudit(env.DB, request, user, 'SYSTEM_DICTIONARY_CREATE', 'system_dictionary_items', item.id, {
      dictionary_key: item.dictionary_key,
      label: item.label,
      sort_order: item.sort_order,
      enabled: item.enabled,
    });
    return json(true, item, '新增成功');
  } catch (e: any) {
    return errorResponse(e);
  }
};

export const onRequestPut: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const user = await requireAuth(env, request, 'admin');
    const body = await request.json().catch(() => ({}));
    const before = await getSystemDictionaryItemById(env.DB, Number(body?.id || 0));
    const item = await updateSystemDictionaryItem(env.DB, body || {}, user.username || null);
    await logAudit(env.DB, request, user, 'SYSTEM_DICTIONARY_UPDATE', 'system_dictionary_items', item.id, {
      before,
      after: item,
    });
    return json(true, item, '保存成功');
  } catch (e: any) {
    return errorResponse(e);
  }
};

export const onRequestDelete: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const user = await requireAuth(env, request, 'admin');
    const body = await request.json().catch(() => ({}));
    requireConfirm(body, '删除', '二次确认不通过');
    const deleted = await deleteSystemDictionaryItem(env.DB, Number(body?.id || 0));
    await logAudit(env.DB, request, user, 'SYSTEM_DICTIONARY_DELETE', 'system_dictionary_items', deleted.id, deleted);
    return json(true, deleted, '删除成功');
  } catch (e: any) {
    return errorResponse(e);
  }
};
