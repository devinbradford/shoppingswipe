import { createHash } from 'node:crypto';

import {
  CONSENT_DISCLOSURES,
  clientIp,
  handleWaitlistRequest,
  normalizeEmail,
  type DbStatus,
  type SignupRecord,
  type WaitlistDeps,
} from './handler';

const ORIGIN = 'https://cureavo.com';
const config = { allowedOrigins: [ORIGIN, 'https://www.cureavo.com'], ipSalt: 'test-salt' };

function makeDeps(status: DbStatus | Error = 'created') {
  const saved: SignupRecord[] = [];
  const created: string[] = [];
  const events: string[] = [];
  const deps: WaitlistDeps = {
    saveSignup: jest.fn(async (record: SignupRecord) => {
      saved.push(record);
      if (status instanceof Error) throw status;
      return status;
    }),
    sha256Hex: async (input) => createHash('sha256').update(input).digest('hex'),
    onNewSignup: jest.fn(async (record) => {
      created.push(record.email);
    }),
    log: (event) => events.push(event),
  };
  return { deps, saved, created, events };
}

function post(body: unknown, init: { origin?: string | null; contentType?: string; ip?: string } = {}) {
  const headers = new Headers({ 'content-type': init.contentType ?? 'application/json', 'x-forwarded-for': init.ip ?? '203.0.113.7, 10.0.0.1' });
  if (init.origin !== null) headers.set('origin', init.origin ?? ORIGIN);
  return new Request('https://example.supabase.co/functions/v1/waitlist-signup', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const valid = { email: '  Devin@Example.COM ', source: 'hero', consent: true, consentVersion: 'hero-v1', company: '', elapsedMs: 4000 };

async function read(res: Response) {
  return { status: res.status, body: await res.json() };
}

describe('normalizeEmail', () => {
  it('trims and lower-cases valid addresses', () => {
    expect(normalizeEmail('  Devin@Example.COM ')).toBe('devin@example.com');
    expect(normalizeEmail('first.last+tag@sub.example.co.uk')).toBe('first.last+tag@sub.example.co.uk');
    expect(normalizeEmail('x@xn--bcher-kva.example')).toBe('x@xn--bcher-kva.example');
  });

  it.each([
    '', 'plainaddress', '@example.com', 'devin@', 'devin@example', 'devin@@example.com', 'de vin@example.com',
    'devin@exa mple.com', '.devin@example.com', 'devin.@example.com', 'de..vin@example.com', 'devin@-example.com',
    'devin@example..com', 'devin@example.c', 'devin@example.123', '<script>@example.com', `${'a'.repeat(65)}@example.com`,
    `devin@${'a'.repeat(250)}.com`, 'devin@exa\nmple.com', 'dev\tin@example.com', 'dévin@example.com',
  ])('rejects %j', (email) => {
    expect(normalizeEmail(email)).toBeNull();
  });

  it('rejects non-strings', () => {
    expect(normalizeEmail(undefined)).toBeNull();
    expect(normalizeEmail(42)).toBeNull();
    expect(normalizeEmail({ email: 'a@b.co' })).toBeNull();
  });
});

describe('clientIp', () => {
  it('prefers the edge headers, then the first forwarded address', () => {
    expect(clientIp(new Headers({ 'cf-connecting-ip': '1.1.1.1', 'x-forwarded-for': '2.2.2.2' }))).toBe('1.1.1.1');
    expect(clientIp(new Headers({ 'x-forwarded-for': '2.2.2.2, 3.3.3.3' }))).toBe('2.2.2.2');
    expect(clientIp(new Headers())).toBe('unknown');
  });
});

describe('handleWaitlistRequest', () => {
  it('saves a valid signup once, normalized, with the consent shown on that form', async () => {
    const { deps, saved, created } = makeDeps('created');
    const res = await handleWaitlistRequest(post(valid), config, deps);
    expect(await read(res)).toEqual({ status: 200, body: { ok: true } });
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      email: 'devin@example.com',
      source: 'hero',
      consentVersion: 'hero-v1',
      consentText: CONSENT_DISCLOSURES['hero-v1'].text,
    });
    // The IP is hashed with the secret salt, never passed on raw.
    expect(saved[0].clientHash).toBe(createHash('sha256').update('test-salt:203.0.113.7').digest('hex'));
    expect(JSON.stringify(saved[0])).not.toContain('203.0.113.7');
    expect(created).toEqual(['devin@example.com']);
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('treats an existing email exactly like a new one, without the welcome hook', async () => {
    const fresh = await read(await handleWaitlistRequest(post(valid), config, makeDeps('created').deps));
    const { deps, created } = makeDeps('exists');
    const again = await read(await handleWaitlistRequest(post(valid), config, deps));
    expect(again).toEqual(fresh);
    expect(created).toEqual([]);
  });

  it('accepts the footer form with its own disclosure', async () => {
    const { deps, saved } = makeDeps('created');
    const res = await handleWaitlistRequest(post({ ...valid, source: 'footer', consentVersion: 'footer-v1' }), config, deps);
    expect(res.status).toBe(200);
    expect(saved[0]).toMatchObject({ source: 'footer', consentText: CONSENT_DISCLOSURES['footer-v1'].text });
  });

  it.each(['not-an-email', '', 'a@b', 'devin@example.c'])('rejects invalid email %j without touching the database', async (email) => {
    const { deps, saved } = makeDeps();
    expect(await read(await handleWaitlistRequest(post({ ...valid, email }), config, deps))).toEqual({
      status: 400,
      body: { ok: false, error: 'invalid_email' },
    });
    expect(saved).toHaveLength(0);
  });

  it('requires consent that matches the form', async () => {
    const { deps, saved } = makeDeps();
    for (const body of [
      { ...valid, consent: false },
      { ...valid, consent: 'yes' },
      { ...valid, consentVersion: 'marketing-v9' },
      { ...valid, consentVersion: 'footer-v1' },
    ]) {
      expect(await read(await handleWaitlistRequest(post(body), config, deps))).toEqual({
        status: 400,
        body: { ok: false, error: 'consent_required' },
      });
    }
    expect(saved).toHaveLength(0);
  });

  it('rejects unknown sources', async () => {
    const { deps } = makeDeps();
    expect((await handleWaitlistRequest(post({ ...valid, source: 'popup' }), config, deps)).status).toBe(400);
  });

  it('silently drops honeypot and too-fast submissions', async () => {
    for (const body of [{ ...valid, company: 'Acme' }, { ...valid, elapsedMs: 200 }, { ...valid, elapsedMs: undefined }]) {
      const { deps, saved, events } = makeDeps();
      expect(await read(await handleWaitlistRequest(post(body), config, deps))).toEqual({ status: 200, body: { ok: true } });
      expect(saved).toHaveLength(0);
      expect(events).toContain('spam_dropped');
    }
  });

  it('returns 429 with Retry-After when rate limited', async () => {
    const res = await handleWaitlistRequest(post(valid), config, makeDeps('rate_limited').deps);
    expect(await read(res)).toEqual({ status: 429, body: { ok: false, error: 'rate_limited' } });
    expect(res.headers.get('retry-after')).toBe('600');
  });

  it('returns a generic 500 when the database fails, without leaking details', async () => {
    const { deps, events } = makeDeps(new Error('connection refused to db.internal:5432 password=hunter2'));
    const res = await handleWaitlistRequest(post(valid), config, deps);
    const text = await res.text();
    expect(res.status).toBe(500);
    expect(JSON.parse(text)).toEqual({ ok: false, error: 'server_error' });
    expect(text).not.toMatch(/hunter2|5432|devin/);
    expect(events).toContain('save_failed');
  });

  it('still succeeds if the future email hook throws', async () => {
    const { deps, events } = makeDeps('created');
    deps.onNewSignup = async () => {
      throw new Error('email provider down');
    };
    expect((await handleWaitlistRequest(post(valid), config, deps)).status).toBe(200);
    expect(events).toContain('on_new_signup_failed');
  });

  it('fails closed when the IP salt secret is missing', async () => {
    const { deps, saved } = makeDeps();
    const res = await handleWaitlistRequest(post(valid), { ...config, ipSalt: '' }, deps);
    expect(await read(res)).toEqual({ status: 500, body: { ok: false, error: 'server_error' } });
    expect(saved).toHaveLength(0);
  });

  it('only answers allowed websites', async () => {
    for (const origin of ['https://evil.example', 'https://cureavo.com.evil.example', null]) {
      const { deps, saved } = makeDeps();
      const res = await handleWaitlistRequest(post(valid, { origin }), config, deps);
      expect(await read(res)).toEqual({ status: 403, body: { ok: false, error: 'forbidden' } });
      expect(res.headers.get('access-control-allow-origin')).toBeNull();
      expect(saved).toHaveLength(0);
    }
  });

  it('handles CORS preflight', async () => {
    const preflight = (origin: string) =>
      new Request('https://x/functions/v1/waitlist-signup', { method: 'OPTIONS', headers: { origin } });
    const ok = await handleWaitlistRequest(preflight(ORIGIN), config, makeDeps().deps);
    expect(ok.status).toBe(204);
    expect(ok.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(ok.headers.get('access-control-allow-methods')).toBe('POST, OPTIONS');
    expect((await handleWaitlistRequest(preflight('https://evil.example'), config, makeDeps().deps)).status).toBe(403);
  });

  it('rejects other methods, non-JSON, malformed and oversized bodies', async () => {
    const { deps, saved } = makeDeps();
    const get = new Request('https://x/', { method: 'GET', headers: { origin: ORIGIN } });
    expect((await handleWaitlistRequest(get, config, deps)).status).toBe(405);
    expect((await handleWaitlistRequest(post(valid, { contentType: 'text/plain' }), config, deps)).status).toBe(415);
    expect((await handleWaitlistRequest(post('{not json'), config, deps)).status).toBe(400);
    expect((await handleWaitlistRequest(post('[1,2]'), config, deps)).status).toBe(400);
    expect((await handleWaitlistRequest(post({ ...valid, padding: 'x'.repeat(3000) }), config, deps)).status).toBe(413);
    expect(saved).toHaveLength(0);
  });
});
