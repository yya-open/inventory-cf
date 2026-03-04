export function validatePassword(raw: any) {
  const pw = String(raw ?? "");
  const s = pw.trim();
  if (s.length < 6) return { ok: false as const, msg: "密码至少 6 位，且必须包含字母和数字" };
  // Optional: cap length to avoid extremely long inputs
  if (s.length > 128) return { ok: false as const, msg: "密码最多 128 位" };
  // Must contain at least one letter and one digit
  const re = /^(?=.*[A-Za-z])(?=.*\d).+$/;
  if (!re.test(s)) return { ok: false as const, msg: "密码至少 6 位，且必须包含字母和数字" };
  return { ok: true as const, password: s };
}
