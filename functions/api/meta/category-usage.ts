import { errorResponse, json, requireAuth } from '../../_auth';
import { countEnabledItemsByCategoryName } from '../services/item-categories';

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, 'admin');
    if (!env.DB) return json(false, null, '未绑定 D1 数据库(DB)');
    const url = new URL(request.url);
    const name = String(url.searchParams.get('name') || '').trim();
    if (!name) return json(false, null, '分类名称无效', 400, 'INVALID_PARAMS');
    const data = await countEnabledItemsByCategoryName(env.DB, name);
    return json(true, data);
  } catch (e: any) {
    return errorResponse(e);
  }
};
