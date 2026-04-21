import { errorResponse, json, requireAuth } from './_auth';
import { requirePermission } from '../_permissions';
import { logAudit } from './_audit';
import {
  createSystemDictionaryItem,
  deleteSystemDictionaryItem,
  getSystemDictionaryItemById,
  groupDictionaryItems,
  getSystemDictionaryVersion,
  listSystemDictionaryItems,
  reorderSystemDictionaryItems,
  type SystemDictionaryKey,
} from './services/system-dictionaries';
import { updateSystemDictionaryItem } from './services/system-dictionaries';
import { invalidateSystemSettingsCache } from './services/system-settings';
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
    const version = await getSystemDictionaryVersion(env.DB, dictionaryKey);
    const etag = `W/"${version}"`;
    if (request.headers.get('if-none-match') === etag) {
      return new Response(null, {
        status: 304,
        headers: {
          ETag: etag,
          'Cache-Control': 'private, max-age=60, stale-while-revalidate=300',
          Vary: 'Cookie, Authorization',
        },
      });
    }
    const items = await listSystemDictionaryItems(env.DB, dictionaryKey);
    const res = json(true, {
      items,
      grouped: groupDictionaryItems(items),
      version,
    });
    res.headers.set('ETag', etag);
    res.headers.set('Cache-Control', 'private, max-age=60, stale-while-revalidate=300');
    res.headers.set('Vary', 'Cookie, Authorization');
    return res;
  } catch (e: any) {
    return errorResponse(e);
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const user = await requirePermission(env, request, 'system_settings_write', 'viewer');
    const body = await request.json().catch(() => ({}));
    const item = await createSystemDictionaryItem(env.DB, body || {}, user.username || null);
    invalidateSystemSettingsCache();
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
    const user = await requirePermission(env, request, 'system_settings_write', 'viewer');
    const body = await request.json().catch(() => ({}));
    if (String(body?.action || '').trim() === 'reorder') {
      const dictionaryKey = parseDictionaryKey(body?.dictionary_key);
      if (!dictionaryKey) throw Object.assign(new Error('缺少字典类型'), { status: 400 });
      const before = await listSystemDictionaryItems(env.DB, dictionaryKey);
      const orderedItems = Array.isArray(body?.items)
        ? body.items.map((item: any) => ({ id: Number(item?.id || 0), updated_at: item?.updated_at || null })).filter((item: any) => item.id > 0)
        : [];
      const items = await reorderSystemDictionaryItems(env.DB, dictionaryKey, orderedItems, user.username || null);
      invalidateSystemSettingsCache();
      await logAudit(env.DB, request, user, 'SYSTEM_DICTIONARY_REORDER', 'system_dictionary_items', dictionaryKey, {
        dictionary_key: dictionaryKey,
        before: before.map((item) => ({ id: item.id, label: item.label, sort_order: item.sort_order })),
        after: items.map((item) => ({ id: item.id, label: item.label, sort_order: item.sort_order })),
      });
      return json(true, { items, grouped: groupDictionaryItems(items) }, '排序已保存');
    }
    const before = await getSystemDictionaryItemById(env.DB, Number(body?.id || 0));
    const item = await updateSystemDictionaryItem(env.DB, body || {}, user.username || null);
    invalidateSystemSettingsCache();
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
    const user = await requirePermission(env, request, 'system_settings_write', 'viewer');
    const body = await request.json().catch(() => ({}));
    requireConfirm(body, '删除', '二次确认不通过');
    const deleted = await deleteSystemDictionaryItem(env.DB, Number(body?.id || 0), body?.updated_at || null);
    invalidateSystemSettingsCache();
    await logAudit(env.DB, request, user, 'SYSTEM_DICTIONARY_DELETE', 'system_dictionary_items', deleted.id, deleted);
    return json(true, deleted, '删除成功');
  } catch (e: any) {
    return errorResponse(e);
  }
};
