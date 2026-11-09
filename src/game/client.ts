/** Calls to /api/game/* (same origin; the Holdrs session is an HttpOnly cookie). */
import type { GameApi } from './engine';

export class GameError extends Error {
  constructor(public code: string, public status = 0, public data: Record<string, unknown> = {}) { super(code); }
}

async function call<T>(method: 'GET' | 'POST', action: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/game/${action}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new GameError('network');
  }
  // Local `vite` has no /api and answers with the HTML page.
  if (!(res.headers.get('content-type') ?? '').includes('application/json')) throw new GameError('unavailable', res.status);
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new GameError(String(data.error ?? 'network'), res.status, data);
  return data as T;
}

export const gameApi: GameApi = {
  today: () => call('GET', 'today'),
  board: (kind) => call('GET', `board?kind=${kind}`),
  start: () => call('POST', 'start', {}),
  finish: (ticket, height, coinsLow, coinsHigh) => call('POST', 'finish', { ticket, height, coinsLow, coinsHigh }),
};
