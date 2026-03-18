import { describe, expect, it } from 'vitest';
import { buildPublicQuery, parsePublicTargetInput } from '../src/utils/publicInventory';

describe('publicInventory utils', () => {
  it('parses token url', () => {
    const target = parsePublicTargetInput('https://example.com/public/pc-asset?token=abc123tokenvalue');
    expect(target?.token).toBe('abc123tokenvalue');
  });

  it('parses id key query', () => {
    const target = parsePublicTargetInput('?id=12&key=hello');
    expect(target?.id).toBe('12');
    expect(target?.key).toBe('hello');
  });

  it('builds public query', () => {
    expect(buildPublicQuery({ id: '12', key: 'hello' })).toBe('id=12&key=hello');
  });
});
