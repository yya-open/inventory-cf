/**
 * Hard confirmation helper for high-risk operations.
 *
 * We require the client to send a `confirm` string in JSON body.
 * Backend validates it to prevent accidental destructive actions.
 */

export function requireConfirm(body: any, expected: string, message?: string) {
  const got = String(body?.confirm ?? "").trim();
  if (got !== expected) {
    const err: any = new Error(message || `需要输入「${expected}」确认操作`);
    err.status = 400;
    throw err;
  }
}
