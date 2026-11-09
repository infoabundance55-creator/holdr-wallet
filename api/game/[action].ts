/**
 * /api/game/<action> — Moon Jump scored runs. Logic lives in ../_lib/game-api.ts.
 * GET: today, board?kind=day|season   POST: start, finish
 * Needs supabase/migrations/002_accounts.sql and 003_game.sql, and the Supabase env vars.
 */
import { supabaseStore } from '../_lib/accounts.js';
import { dbConfigured } from '../_lib/db.js';
import { handleGame } from '../_lib/game-api.js';
import { supabaseGameStore } from '../_lib/game-store.js';

function run(req: Request): Promise<Response> | Response {
  if (!dbConfigured()) {
    return new Response(JSON.stringify({ error: 'not_configured' }), { status: 503, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  }
  return handleGame(req, { store: supabaseStore, game: supabaseGameStore, now: () => new Date() });
}

export function GET(req: Request) { return run(req); }
export function POST(req: Request) { return run(req); }
