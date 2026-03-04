export function validatePassword(p: string) {
  const s = String(p || "");
  if (s.length < 6) return { ok: false, message: "密码至少 6 位" };
  const hasLetter = /[A-Za-z]/.test(s);
  const hasDigit = /\d/.test(s);
  if (!hasLetter || !hasDigit) return { ok: false, message: "密码需同时包含字母和数字" };
  return { ok: true, message: "" };
}
