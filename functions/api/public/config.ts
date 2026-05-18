import { json } from '../../_auth';
import { getPublicSettingsPayload, getSystemSettings } from '../services/system-settings';
import { withErrorHandling } from '../_error';

type Env = { DB: D1Database };

export const onRequestGet = withErrorHandling<Env>(async ({ env }) => {
  const settings = await getSystemSettings(env.DB);
  return json(true, getPublicSettingsPayload(settings));
});
