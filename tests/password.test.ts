import { describe, expect, it } from 'vitest';
import { validatePassword } from '../src/utils/password';

describe('validatePassword', () => {
  it('accepts valid mixed password', () => { expect(validatePassword('abc123')).toEqual({ ok: true, password: 'abc123' }); });
  it('rejects too short password', () => { expect(validatePassword('a1b2')).toMatchObject({ ok: false }); });
  it('rejects password without digits', () => { expect(validatePassword('abcdef')).toMatchObject({ ok: false }); });
});
