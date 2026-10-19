// Thin client for the Chess.com Published-Data API (https://www.chess.com/news/view/published-data-api).
// No auth, read-only, public data only. Chess.com asks callers to send a descriptive User-Agent.

const BASE = "https://api.chess.com/pub";
const USER_AGENT = "chesscom-stats-mcp (+https://github.com/patrick-oreilly/chesscom-stats-mcp)";

export type TimeClass = "bullet" | "blitz" | "rapid" | "daily";

export type GameSide = {
  username: string;
  rating: number;
  result: string;
};

export type Game = {
  url: string;
  end_time: number;
  rated: boolean;
  time_class: TimeClass;
  time_control: string;
  rules: string;
  eco?: string;
  accuracies?: { white: number; black: number };
  white: GameSide;
  black: GameSide;
};

export type Profile = {
  username: string;
  name?: string;
  url: string;
  country?: string;
  joined: number;
  last_online: number;
  followers: number;
  status: string;
  league?: string;
  title?: string;
};

type RatingBlock = {
  last?: { rating: number; date: number };
  best?: { rating: number; date: number; game?: string };
  record?: { win: number; loss: number; draw: number };
};

export type Stats = Partial<Record<`chess_${TimeClass}`, RatingBlock>> & {
  tactics?: { highest?: { rating: number } };
  puzzle_rush?: { best?: { score: number } };
};

export class ChessComError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
  if (res.status === 404) throw new ChessComError(`Not found on Chess.com: ${path}`, 404);
  if (res.status === 429) throw new ChessComError("Chess.com rate limit hit; try again in a moment.", 429);
  if (!res.ok) throw new ChessComError(`Chess.com returned ${res.status} for ${path}`, res.status);
  return (await res.json()) as T;
}

const user = (username: string) => encodeURIComponent(username.trim().toLowerCase());

export const getProfile = (username: string) => get<Profile>(`/player/${user(username)}`);

export const getStats = (username: string) => get<Stats>(`/player/${user(username)}/stats`);

export async function getMonthGames(username: string, year: number, month: number): Promise<Game[]> {
  const mm = String(month).padStart(2, "0");
  try {
    const { games } = await get<{ games: Game[] }>(`/player/${user(username)}/games/${year}/${mm}`);
    return games;
  } catch (err) {
    // A month with no games is a 404 for a real player; check the player exists before treating it as empty.
    if (err instanceof ChessComError && err.status === 404) {
      await getProfile(username);
      return [];
    }
    throw err;
  }
}

export async function getArchiveMonths(username: string): Promise<{ year: number; month: number }[]> {
  const { archives } = await get<{ archives: string[] }>(`/player/${user(username)}/games/archives`);
  return archives.map((url) => {
    const [year, month] = url.split("/").slice(-2).map(Number);
    return { year, month };
  });
}
