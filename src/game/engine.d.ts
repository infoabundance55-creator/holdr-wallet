export interface GameMe {
  username: string | null;
  char: 'boss' | 'frog' | 'laser' | 'satoshi';
  xp: number;
  level: number;
  coins: number;
  streak: number;
  checkedInToday: boolean;
}
export interface GameToday { day: number; n: number; mod: number }
export interface GameApi {
  session(): Promise<{ me: GameMe; today: GameToday } | null>;
  login(): Promise<{ me: GameMe; today: GameToday }>;
  nameCheck(u: string): Promise<{ ok: boolean; reason: string | null }>;
  setProfile(patch: { username?: string; char?: string }): Promise<{ me: GameMe }>;
  start(daily: boolean): Promise<{ ticket: string; seed: number; today: GameToday }>;
  finish(ticket: string, height: number, coins: number): Promise<{
    gained: number; first: boolean; isBest: boolean; best: number; rank: number | null; total: number | null; me: GameMe;
  }>;
  leaderboard(): Promise<{ rows: unknown[]; mine: { rank: number; height: number } | null }>;
  town(level: number): Promise<{ level: number; count: number | null; residents: unknown[] }>;
  greet(username: string): Promise<{ ok: boolean }>;
  checkin(): Promise<{ already: boolean; gained?: number; me: GameMe }>;
}
export interface GameOptions {
  api: GameApi;
  images: Record<'boss' | 'frog' | 'laser' | 'satoshi', string>;
  onExit(): void;
}
export function mountGame(root: HTMLElement, opts: GameOptions): { destroy(): void };
