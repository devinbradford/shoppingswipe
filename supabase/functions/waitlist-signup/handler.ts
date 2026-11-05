/**
 * Waitlist signup endpoint: the request handling, with no Deno or Supabase
 * imports so it can be unit-tested anywhere. `index.ts` wires it to Deno and
 * to the database function `public.waitlist_signup()`.
 *
 * Contract (always JSON, never echoes the email or internal errors):
 *   200 { ok: true }                          signed up, or already on the list
 *   400 { ok: false, error: 'invalid_email' | 'invalid_request' | 'consent_required' }
 *   403 { ok: false, error: 'forbidden' }     request not from an allowed website
 *   405 / 413 / 415                           wrong method / body too big / not JSON
 *   429 { ok: false, error: 'rate_limited' }  too many attempts (Retry-After header)
 *   500 { ok: false, error: 'server_error' }
 */

export type DbStatus = 'created' | 'exists' | 'rate_limited' | 'invalid_email' | 'invalid_request';

export type SignupSource = 'hero' | 'footer';

export interface SignupRecord {
  email: string;
  source: SignupSource;
  consentVersion: string;
  consentText: string;
  clientHash: string;
}

export interface WaitlistConfig {
  /** Exact origins allowed to call the endpoint, e.g. https://cureavo.com */
  allowedOrigins: string[];
  /** Secret salt for hashing visitor IPs (rate limiting). Required. */
  ipSalt: string;
}

export interface WaitlistDeps {
  /** Calls public.waitlist_signup() and returns its status. Throws on failure. */
  saveSignup(record: SignupRecord): Promise<DbStatus>;
  /** SHA-256 hex digest. */
  sha256Hex(input: string): Promise<string>;
  /**
   * Runs only for brand-new signups. Empty today: add the welcome or
   * confirmation email here later. Errors are logged and never fail the signup.
   */
  onNewSignup?(record: Omit<SignupRecord, 'clientHash'>): Promise<void>;
  log?(event: string, details?: Record<string, unknown>): void;
}

/**
 * The disclosures shown next to each form, keyed by the `data-consent`
 * attribute on the form. Saved with every signup so the record shows exactly
 * what the person agreed to. When the wording on the page changes, add a NEW
 * version here (keep the old ones, since cached pages may still send them).
 */
export const CONSENT_DISCLOSURES: Record<string, { source: SignupSource; text: string }> = {
  'hero-v1': { source: 'hero', text: 'Free to join. Be first to know when Arvelle launches.' },
  'hero-v2': { source: 'hero', text: 'Free to join. Be first to know when CureAvo launches.' },
  'footer-v1': { source: 'footer', text: 'Free to join. We’ll only email you about our launch.' },
};

export const MAX_BODY_BYTES = 2048;
/** Submissions faster than this after page load are treated as bots. */
export const MIN_ELAPSED_MS = 1500;
export const RETRY_AFTER_SECONDS = 600;

const LOCAL_PART = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const DOMAIN_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const TLD = /^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;

/** Trims and lower-cases an email and checks it is plausible. Returns null if not. */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const email = raw.trim().toLowerCase();
  if (email.length < 3 || email.length > 254) return null;
  const at = email.indexOf('@');
  if (at < 1 || at !== email.lastIndexOf('@')) return null;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (local.length > 64 || !LOCAL_PART.test(local)) return null;
  const labels = domain.split('.');
  if (labels.length < 2 || domain.length > 253) return null;
  if (!labels.every((label) => DOMAIN_LABEL.test(label))) return null;
  if (!TLD.test(labels[labels.length - 1])) return null;
  return email;
}

/** Best-effort client IP from the proxy headers Supabase passes through. */
export function clientIp(headers: Headers): string {
  const direct = headers.get('cf-connecting-ip') ?? headers.get('x-real-ip');
  if (direct) return direct.trim();
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return 'unknown';
}

function corsHeaders(origin: string | null, allowed: boolean): Record<string, string> {
  const headers: Record<string, string> = { Vary: 'Origin' };
  if (allowed && origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type';
    headers['Access-Control-Max-Age'] = '86400';
  }
  return headers;
}

function json(status: number, body: Record<string, unknown>, extra: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
  });
}

export async function handleWaitlistRequest(
  req: Request,
  config: WaitlistConfig,
  deps: WaitlistDeps,
): Promise<Response> {
  const log = deps.log ?? (() => {});
  const origin = req.headers.get('origin');
  const originAllowed = origin !== null && config.allowedOrigins.includes(origin);
  const cors = corsHeaders(origin, originAllowed);

  if (req.method === 'OPTIONS') {
    return originAllowed
      ? new Response(null, { status: 204, headers: cors })
      : json(403, { ok: false, error: 'forbidden' }, cors);
  }
  if (req.method !== 'POST') {
    return json(405, { ok: false, error: 'method_not_allowed' }, { ...cors, Allow: 'POST, OPTIONS' });
  }
  if (!originAllowed) {
    log('forbidden_origin', { origin });
    return json(403, { ok: false, error: 'forbidden' }, cors);
  }
  if (!(req.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    return json(415, { ok: false, error: 'invalid_request' }, cors);
  }

  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return json(400, { ok: false, error: 'invalid_request' }, cors);
  }
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
    return json(413, { ok: false, error: 'invalid_request' }, cors);
  }

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    body = parsed as Record<string, unknown>;
  } catch {
    return json(400, { ok: false, error: 'invalid_request' }, cors);
  }

  // Anti-spam: a hidden "company" field people can't see, and a minimum time
  // on the page. Bots get the normal success reply so they learn nothing.
  const honeypot = typeof body.company === 'string' ? body.company.trim() : '';
  const elapsed = typeof body.elapsedMs === 'number' ? body.elapsedMs : 0;
  if (honeypot !== '' || elapsed < MIN_ELAPSED_MS) {
    log('spam_dropped', { reason: honeypot !== '' ? 'honeypot' : 'too_fast' });
    return json(200, { ok: true }, cors);
  }

  const email = normalizeEmail(body.email);
  if (!email) return json(400, { ok: false, error: 'invalid_email' }, cors);

  const disclosure = typeof body.consentVersion === 'string' ? CONSENT_DISCLOSURES[body.consentVersion] : undefined;
  if (body.source !== 'hero' && body.source !== 'footer') {
    return json(400, { ok: false, error: 'invalid_request' }, cors);
  }
  if (body.consent !== true || !disclosure || disclosure.source !== body.source) {
    return json(400, { ok: false, error: 'consent_required' }, cors);
  }

  if (!config.ipSalt) {
    log('misconfigured', { missing: 'WAITLIST_IP_SALT' });
    return json(500, { ok: false, error: 'server_error' }, cors);
  }

  const record: SignupRecord = {
    email,
    source: disclosure.source,
    consentVersion: body.consentVersion as string,
    consentText: disclosure.text,
    clientHash: await deps.sha256Hex(`${config.ipSalt}:${clientIp(req.headers)}`),
  };

  let status: DbStatus;
  try {
    status = await deps.saveSignup(record);
  } catch (error) {
    log('save_failed', { message: error instanceof Error ? error.message : 'unknown' });
    return json(500, { ok: false, error: 'server_error' }, cors);
  }

  switch (status) {
    case 'created':
      if (deps.onNewSignup) {
        try {
          await deps.onNewSignup({
            email: record.email,
            source: record.source,
            consentVersion: record.consentVersion,
            consentText: record.consentText,
          });
        } catch (error) {
          log('on_new_signup_failed', { message: error instanceof Error ? error.message : 'unknown' });
        }
      }
      return json(200, { ok: true }, cors);
    case 'exists':
      // Same reply as a new signup: never reveal whether an email is on the list.
      return json(200, { ok: true }, cors);
    case 'rate_limited':
      return json(429, { ok: false, error: 'rate_limited' }, { ...cors, 'Retry-After': String(RETRY_AFTER_SECONDS) });
    case 'invalid_email':
      return json(400, { ok: false, error: 'invalid_email' }, cors);
    default:
      return json(400, { ok: false, error: 'invalid_request' }, cors);
  }
}
