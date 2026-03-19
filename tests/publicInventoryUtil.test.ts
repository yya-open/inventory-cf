import { beforeEach, describe, expect, it } from 'vitest';
import { buildPublicQuery, enqueuePendingPublicSubmission, loadPendingPublicSubmissions, parsePublicTargetInput } from '../src/utils/publicInventory';

const memory = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem(key: string) { return memory.has(key) ? memory.get(key)! : null; },
  setItem(key: string, value: string) { memory.set(key, String(value)); },
  removeItem(key: string) { memory.delete(key); },
  clear() { memory.clear(); },
};

describe('publicInventory utils', () => {
  beforeEach(() => {
    memory.clear();
  });

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

  it('dedupes same pending submission by target and payload', () => {
    enqueuePendingPublicSubmission('pc', { token: 'abc-token' }, { action: 'OK' }, '盘点通过');
    enqueuePendingPublicSubmission('pc', { token: 'abc-token' }, { action: 'OK' }, '盘点通过');
    const rows = loadPendingPublicSubmissions('pc');
    expect(rows).toHaveLength(1);
    expect(rows[0].target.token).toBe('abc-token');
  });
});
