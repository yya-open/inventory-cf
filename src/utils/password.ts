export function validatePassword(pw: any) {
  const s = String(pw ?? "").trim();
  if (s.length < 6) return { ok: false as const, msg: "密码至少6位，且必须包含字母和数字" };
  if (s.length > 128) return { ok: false as const, msg: "密码最多128位" };
  const re = /^(?=.*[A-Za-z])(?=.*\d).+$/;
  if (!re.test(s)) return { ok: false as const, msg: "密码至少6位，且必须包含字母和数字" };
  return { ok: true as const, password: s };
}
