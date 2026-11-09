export type GameChar = 'raccoon' | 'frog' | 'bull' | 'anon';

export interface GameRuns { used: number; left: number; max: number }
export interface GameToday { day: number; n: number; mod: number; resetIn: number }
export interface BoardRow { rank: number; username: string; char: GameChar; level: number; points: number; me: boolean }

export interface GameApi {
  today(): Promise<{ today: GameToday; runs: GameRuns; best: number | null; pointsToday: number; rank: number | null; top: BoardRow[] }>;
  board(kind: 'day' | 'season'): Promise<{ kind: string; day: number; season: string; rows: BoardRow[]; mine: BoardRow | null }>;
  start(): Promise<{ ticket: string; seed: number; run: number; today: GameToday; runs: GameRuns }>;
  finish(ticket: string, height: number, coinsLow: number, coinsHigh: number): Promise<{
    points: number; best: number; isBest: boolean; rank: number | null; pointsToday: number; runs: GameRuns;
  }>;
}

/** What the game shows about the signed-in player (from the Holdrs account). */
export interface GameProfile {
  username: string;
  char: GameChar;
  total: number;
  house: { img: string; name: string; title: string };
  /** Next level, or null at the top. */
  next: { name: string; min: number } | null;
  /** 0–1 towards the next level. */
  progress: number;
}

export interface GameOptions {
  api: GameApi;
  images: Record<GameChar, string>;
  /** Read each time it's needed, so a changed look or new points show up. */
  profile(): GameProfile;
  onExit(): void;
  onChangeLook(): void;
  /** The session ended (expired or signed out elsewhere). */
  onSignedOut(): void;
}

export function mountGame(root: HTMLElement, opts: GameOptions): { refresh(): void; destroy(): void };
