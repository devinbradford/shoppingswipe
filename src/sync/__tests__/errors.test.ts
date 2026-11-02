import { isPermanent } from '../supabaseRemote';

describe('server error handling', () => {
  it('treats rule violations as permanent and network trouble as retryable', () => {
    expect(isPermanent({ code: '23505', message: 'duplicate key' })).toBe(true); // duplicate list name
    expect(isPermanent({ code: '42501', message: 'permission denied' })).toBe(true);
    expect(isPermanent({ code: '22P02', message: 'invalid input' })).toBe(true);
    expect(isPermanent({ message: 'TypeError: Network request failed' })).toBe(false);
    expect(isPermanent({ code: 'PGRST301', message: 'JWT expired' })).toBe(false);
    expect(isPermanent({ code: '57014', message: 'statement timeout' })).toBe(false);
  });
});
