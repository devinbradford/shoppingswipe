/**
 * Supabase Edge Function: POST /functions/v1/waitlist-signup
 *
 * Deploy with JWT verification OFF (it's a public form endpoint; it is
 * protected by the origin allow-list, honeypot, timing check and database
 * rate limits instead). See docs/WEBSITE.md.
 *
 * Secrets (Supabase dashboard > Edge Functions > Secrets, never in the website):
 *   WAITLIST_ALLOWED_ORIGINS  comma-separated, e.g. https://cureavo.com,https://www.cureavo.com
 *   WAITLIST_IP_SALT          long random string, used to hash visitor IPs
 * Provided automatically by Supabase:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   (or set WAITLIST_SERVICE_KEY to a secret API key if legacy keys are disabled)
 */
import { handleWaitlistRequest, type DbStatus, type SignupRecord } from './handler.ts';

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): unknown;
};

const SUPABASE_URL = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/$/, '');
const SERVICE_KEY = Deno.env.get('WAITLIST_SERVICE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const config = {
  allowedOrigins: (Deno.env.get('WAITLIST_ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean),
  ipSalt: Deno.env.get('WAITLIST_IP_SALT') ?? '',
};

const STATUSES: DbStatus[] = ['created', 'exists', 'rate_limited', 'invalid_email', 'invalid_request'];

async function saveSignup(record: SignupRecord): Promise<DbStatus> {
  if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Supabase URL or service key missing');
  // New-style secret keys (sb_secret_...) go only in `apikey`; legacy JWT keys also as Bearer.
  const headers: Record<string, string> = { apikey: SERVICE_KEY, 'Content-Type': 'application/json' };
  if (!SERVICE_KEY.startsWith('sb_')) headers.Authorization = `Bearer ${SERVICE_KEY}`;

  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/waitlist_signup`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      p_email: record.email,
      p_source: record.source,
      p_consent_version: record.consentVersion,
      p_consent_text: record.consentText,
      p_client_hash: record.clientHash,
    }),
  });
  if (!res.ok) throw new Error(`waitlist_signup RPC failed with HTTP ${res.status}`);
  const status: unknown = await res.json();
  if (typeof status !== 'string' || !STATUSES.includes(status as DbStatus)) {
    throw new Error('waitlist_signup returned an unexpected value');
  }
  return status as DbStatus;
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function onNewSignup(): Promise<void> {
  // Later: send a welcome or confirmation email here (e.g. via Resend/Postmark),
  // then set welcome_email_sent_at / confirmed_at on the row.
}

function log(event: string, details: Record<string, unknown> = {}): void {
  // Never log email addresses or IPs.
  console.log(JSON.stringify({ fn: 'waitlist-signup', event, ...details }));
}

Deno.serve((req) => handleWaitlistRequest(req, config, { saveSignup, sha256Hex, onNewSignup, log }));
