import { json } from '../../_auth';
import { getPublicSettingsPayload, getSystemSettings } from '../services/system-settings';
import { withErrorHandling } from '../_error';

type Env = { DB: D1Database };

// Public unauthenticated endpoint: getPublicSettingsPayload is an explicit allowlist of client UI settings only (no secrets/ops config)
export const onRequestGet = withErrorHandling<Env>(async ({ env }) => {
  const settings = await getSystemSettings(env.DB);
  return json(true, getPublicSettingsPayload(settings));
});
