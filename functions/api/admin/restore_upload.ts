import { errorResponse, json, requireAuth } from '../../_auth';
import { ensureCoreSchema } from '../_schema';

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, 'admin');
    await ensureCoreSchema(env.DB);
    return json(false, { use_restore_job: true }, '同步上传恢复入口已下线，请通过 restore_job/create + restore_job/run 执行恢复，以避免半恢复状态', 409);
  } catch (e: any) {
    return errorResponse(e);
  }
};
