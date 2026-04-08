import { errorResponse, json } from '../_auth';
import { requirePermission } from '../_permissions';
import { ensureBrowserObservabilityTables } from './services/observability';

type Sample = {
  kind?: string;
  path?: string;
  fullPath?: string;
  duration_ms?: number;
  event_name?: string;
  metadata?: Record<string, unknown> | null;
  ts?: number;
};

type RouteSample = {
  kind: 'route';
  path: string;
  fullPath: string;
  duration: number;
};

type EventSample = {
  kind: 'event';
  path: string;
  fullPath: string;
  eventName: string;
  metadataJson: string | null;
};

function normalizePath(input: unknown, fallback = '/') {
  const value = String(input || '').trim();
  return (value || fallback).slice(0, 500);
}

function normalizeSample(input: Sample): RouteSample | EventSample | null {
  const path = normalizePath(input?.path, '/').slice(0, 180);
  const fullPath = normalizePath(input?.fullPath, path);
  const kind = String(input?.kind || 'route').trim().toLowerCase();
  if (kind === 'event') {
    const eventName = String(input?.event_name || '').trim();
    if (!eventName) return null;
    let metadataJson: string | null = null;
    try {
      if (input?.metadata && typeof input.metadata === 'object') {
        metadataJson = JSON.stringify(input.metadata).slice(0, 2000);
      }
    } catch {
      metadataJson = null;
    }
    return { kind: 'event', path, fullPath, eventName: eventName.slice(0, 80), metadataJson };
  }
  const duration = Math.round(Number(input?.duration_ms || 0));
  if (!path || !Number.isFinite(duration) || duration <= 0) return null;
  return { kind: 'route', path, fullPath, duration };
}

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET?: string }> = async ({ env, request }) => {
  try {
    const user = await requirePermission(env, request, 'ops_tools', 'viewer').catch(() => null);
    await ensureBrowserObservabilityTables(env.DB);
    const body = await request.json().catch(() => ({} as any));
    const rawSamples = Array.isArray(body?.samples) ? body.samples : [];
    const samples = rawSamples.map(normalizeSample).filter(Boolean).slice(0, 20) as Array<RouteSample | EventSample>;
    if (!samples.length) return json(true, { inserted: 0, route_inserted: 0, event_inserted: 0 });
    const stmts = samples.map((sample) => {
      if (sample.kind === 'event') {
        return env.DB.prepare(
          `INSERT INTO browser_event_log (event_name, path, full_path, metadata_json, username)
           VALUES (?, ?, ?, ?, ?)`
        ).bind(sample.eventName, sample.path, sample.fullPath, sample.metadataJson, user?.username || null);
      }
      return env.DB.prepare(
        `INSERT INTO browser_perf_log (kind, path, full_path, duration_ms, username)
         VALUES (?, ?, ?, ?, ?)`
      ).bind(sample.kind, sample.path, sample.fullPath, sample.duration, user?.username || null);
    });
    await env.DB.batch(stmts);
    const routeInserted = samples.filter((sample) => sample.kind === 'route').length;
    const eventInserted = samples.length - routeInserted;
    return json(true, { inserted: stmts.length, route_inserted: routeInserted, event_inserted: eventInserted });
  } catch (e: any) {
    return errorResponse(e);
  }
};
