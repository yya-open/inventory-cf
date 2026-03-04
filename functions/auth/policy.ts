export function validatePassword(p: string): string | null {

  if (p.length < 6) {
    return "Password must be at least 6 characters"
  }

  if (p.length > 128) {
    return "Password too long"
  }

  const hasLetter = /[A-Za-z]/.test(p)
  const hasNumber = /[0-9]/.test(p)

  if (!hasLetter || !hasNumber) {
    return "Password must contain letters and numbers"
  }

  return null
}
