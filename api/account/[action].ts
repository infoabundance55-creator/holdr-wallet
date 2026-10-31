/**
 * /api/account/<action> — sign-in and profile for Holdrs accounts. Logic lives in ../_lib/account-api.ts.
 * GET:  me, name-check?u=
 * POST: nonce, login, username, look, level-seen, logout
 * Needs the Supabase env vars (STORAGE_SUPABASE_URL + STORAGE_SUPABASE_SECRET_KEY) and supabase/migrations/002_accounts.sql.
 */
import { handleAccount } from '../_lib/account-api.js';
import { supabaseStore } from '../_lib/accounts.js';
import { dbConfigured } from '../_lib/db.js';

function run(req: Request): Promise<Response> | Response {
  if (!dbConfigured()) {
    return new Response(JSON.stringify({ error: 'not_configured' }), { status: 503, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  }
  return handleAccount(req, { store: supabaseStore, now: () => new Date() });
}

export function GET(req: Request) { return run(req); }
export function POST(req: Request) { return run(req); }
