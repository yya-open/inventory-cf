import { json, requireAuth } from '../../_auth';
import { withErrorHandling } from '../_error';
import { ensureCoreSchema } from '../_schema';

export const onRequestPost = withErrorHandling<{ DB: D1Database; JWT_SECRET: string }>(async ({ env, request }) => {
  await requireAuth(env, request, 'admin');
  await ensureCoreSchema(env.DB);
  return json(false, { use_restore_job: true }, '同步恢复入口已下线，请改用”创建恢复任务 / restore_job”链路执行恢复，以避免半恢复状态', 409);
});
