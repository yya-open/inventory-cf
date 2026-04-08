export type ApiSuccessEnvelope<T> = { ok: true; data: T; message?: string; meta?: Record<string, unknown> };
export type ApiFailureEnvelope = { ok: false; data: null; message: string; meta?: Record<string, unknown> };

export function apiOk<T>(data: T, options?: { message?: string; status?: number; meta?: Record<string, unknown> }) {
  return Response.json({ ok: true, data, message: options?.message, meta: options?.meta } satisfies ApiSuccessEnvelope<T>, { status: options?.status || 200 });
}

export function apiFail(message: string, options?: { status?: number; meta?: Record<string, unknown> }) {
  return Response.json({ ok: false, data: null, message, meta: options?.meta } satisfies ApiFailureEnvelope, { status: options?.status || 400 });
}
