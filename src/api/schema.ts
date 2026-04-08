export type Schema<T> = (input: unknown) => T;

export function asObject(input: unknown, label = '对象'): Record<string, any> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error(`${label}格式无效`);
  }
  return input as Record<string, any>;
}

export function asArray<T>(input: unknown, itemSchema: Schema<T>, label = '数组'): T[] {
  if (!Array.isArray(input)) throw new Error(`${label}格式无效`);
  return input.map((item) => itemSchema(item));
}

export function asString(input: unknown, fallback = ''): string {
  return typeof input === 'string' ? input : fallback;
}

export function asNullableString(input: unknown): string | null {
  return input == null || input === '' ? null : String(input);
}

export function asNumber(input: unknown, fallback = 0): number {
  const value = Number(input);
  return Number.isFinite(value) ? value : fallback;
}

export function asNullableNumber(input: unknown): number | null {
  if (input == null || input === '') return null;
  const value = Number(input);
  return Number.isFinite(value) ? value : null;
}

export function asBoolean(input: unknown, fallback = false): boolean {
  return typeof input === 'boolean' ? input : fallback;
}

export function optional<T>(schema: Schema<T>, fallback: T): Schema<T> {
  return (input: unknown) => (input == null ? fallback : schema(input));
}
