import { describe, expect, it } from 'vitest';
import { asArray, asBoolean, asNullableNumber, asObject, asString, optional } from '../src/api/schema';

describe('api schema helpers', () => {
  it('normalizes primitives and optional values', () => {
    expect(asString('abc')).toBe('abc');
    expect(asString(10 as any, 'fallback')).toBe('fallback');
    expect(asBoolean(true)).toBe(true);
    expect(asBoolean('1' as any, true)).toBe(true);
    expect(asNullableNumber('42')).toBe(42);
    expect(asNullableNumber('')).toBeNull();
    expect(optional((input) => Number(input), 7)(null)).toBe(7);
  });

  it('validates object and array inputs', () => {
    expect(asObject({ a: 1 })).toEqual({ a: 1 });
    expect(asArray([1, 2], (input) => Number(input))).toEqual([1, 2]);
    expect(() => asObject([])).toThrow(/对象格式无效/);
    expect(() => asArray({}, (input) => Number(input))).toThrow(/数组格式无效/);
  });
});
