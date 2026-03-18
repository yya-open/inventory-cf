import { errorResponse, json } from '../../_auth';
import { getPublicSettingsPayload, getSystemSettings } from '../services/system-settings';

type Env = { DB: D1Database };

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    const settings = await getSystemSettings(env.DB);
    return json(true, getPublicSettingsPayload(settings));
  } catch (e: any) {
    return errorResponse(e);
  }
};
