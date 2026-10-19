// Pure functions that turn raw Chess.com games into the numbers a person actually asks about.
// Kept free of I/O so they can be tested against fixtures.

import type { Game, TimeClass } from "./chesscom.js";

export type Outcome = "win" | "loss" | "draw";

const DRAW_RESULTS = new Set(["agreed", "repetition", "stalemate", "insufficient", "50move", "timevsinsufficient"]);

export type PlayerGame = {
  url: string;
  endTime: number;
  timeClass: TimeClass;
  rated: boolean;
  color: "white" | "black";
  outcome: Outcome;
  /** How the game ended, from the loser's side: "checkmated", "resigned", "timeout", "agreed"... */
  method: string;
  rating: number;
  opponent: string;
  opponentRating: number;
  opening: string | null;
  accuracy: number | null;
};

/** Opening name from the ECO URL slug: ".../openings/Sicilian-Defense-Najdorf-6.Be3" -> "Sicilian Defense Najdorf 6.Be3". */
export function openingName(eco: string | undefined): string | null {
  if (!eco) return null;
  const slug = eco.split("/openings/")[1];
  return slug ? decodeURIComponent(slug).replace(/-/g, " ") : null;
}

/** The opening family: the name up to its first "Opening", "Defense", "Gambit"... ("Sicilian Defense Najdorf" -> "Sicilian Defense"). */
export function openingFamily(name: string): string {
  const words = name.split(" ");
  const end = words.findIndex((w) => /^(Opening|Defense|Gambit|Game|Attack|System)$/.test(w));
  return words.slice(0, end === -1 ? 3 : end + 1).join(" ");
}

export function toPlayerGame(game: Game, username: string): PlayerGame | null {
  const u = username.toLowerCase();
  const color = game.white.username.toLowerCase() === u ? "white" : game.black.username.toLowerCase() === u ? "black" : null;
  if (!color) return null;
  const me = game[color];
  const them = game[color === "white" ? "black" : "white"];
  const outcome: Outcome = me.result === "win" ? "win" : DRAW_RESULTS.has(me.result) ? "draw" : "loss";
  return {
    url: game.url,
    endTime: game.end_time,
    timeClass: game.time_class,
    rated: game.rated,
    color,
    outcome,
    method: outcome === "win" ? them.result : me.result,
    rating: me.rating,
    opponent: them.username,
    opponentRating: them.rating,
    opening: openingName(game.eco),
    accuracy: game.accuracies?.[color] ?? null,
  };
}

type Tally = { games: number; wins: number; losses: number; draws: number; scorePct: number };

function record(games: PlayerGame[]): Tally {
  const wins = games.filter((g) => g.outcome === "win").length;
  const losses = games.filter((g) => g.outcome === "loss").length;
  const draws = games.length - wins - losses;
  const scorePct = games.length ? Math.round(((wins + draws / 2) / games.length) * 1000) / 10 : 0;
  return { games: games.length, wins, losses, draws, scorePct };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function countBy<T>(items: T[], key: (t: T) => string): { [k: string]: number } {
  const out: { [k: string]: number } = {};
  for (const item of items) out[key(item)] = (out[key(item)] ?? 0) + 1;
  return out;
}

function gameRef(g: PlayerGame) {
  return {
    opponent: g.opponent,
    opponentRating: g.opponentRating,
    timeClass: g.timeClass,
    method: g.method,
    url: g.url,
  };
}

export type TimeClassSummary = Tally & {
  /** Ratings on a game are post-game, so this is the rating after the first rated game in the window. */
  ratingAfterFirstGame: number;
  ratingAfterLastGame: number;
  ratingChange: number;
  peakRating: number;
};

export function summarise(games: PlayerGame[]) {
  const sorted = [...games].sort((a, b) => a.endTime - b.endTime);

  const byTimeClass: { [tc: string]: TimeClassSummary } = {};
  for (const tc of new Set(sorted.map((g) => g.timeClass))) {
    const tcGames = sorted.filter((g) => g.timeClass === tc);
    const rated = tcGames.filter((g) => g.rated);
    const ratings = rated.map((g) => g.rating);
    byTimeClass[tc] = {
      ...record(tcGames),
      ratingAfterFirstGame: ratings[0] ?? 0,
      ratingAfterLastGame: ratings.at(-1) ?? 0,
      ratingChange: ratings.length ? ratings.at(-1)! - ratings[0] : 0,
      peakRating: ratings.length ? Math.max(...ratings) : 0,
    };
  }

  const wins = sorted.filter((g) => g.outcome === "win");
  const losses = sorted.filter((g) => g.outcome === "loss");
  const bestWin = wins.reduce<PlayerGame | null>((b, g) => (!b || g.opponentRating > b.opponentRating ? g : b), null);
  const worstLoss = losses.reduce<PlayerGame | null>((w, g) => (!w || g.opponentRating < w.opponentRating ? g : w), null);

  const withAccuracy = sorted.filter((g) => g.accuracy !== null);
  const avgAccuracy = withAccuracy.length
    ? round1(withAccuracy.reduce((s, g) => s + g.accuracy!, 0) / withAccuracy.length)
    : null;

  const families = countBy(
    sorted.filter((g) => g.opening),
    (g) => `${g.color}: ${openingFamily(g.opening!)}`,
  );
  const topOpenings = Object.entries(families)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([key]) => {
      const [color, family] = key.split(": ");
      const games = sorted.filter((g) => g.color === color && g.opening && openingFamily(g.opening) === family);
      return { opening: family, as: color, ...record(games) };
    });

  // Longest run of consecutive wins and losses, in time order.
  let winStreak = 0;
  let lossStreak = 0;
  let run = 0;
  let prev: Outcome | null = null;
  for (const g of sorted) {
    run = g.outcome === prev ? run + 1 : 1;
    prev = g.outcome;
    if (g.outcome === "win") winStreak = Math.max(winStreak, run);
    if (g.outcome === "loss") lossStreak = Math.max(lossStreak, run);
  }

  return {
    overall: record(sorted),
    byTimeClass,
    asWhite: record(sorted.filter((g) => g.color === "white")),
    asBlack: record(sorted.filter((g) => g.color === "black")),
    averageAccuracy: avgAccuracy,
    gamesWithAccuracy: withAccuracy.length,
    howWinsEnded: countBy(wins, (g) => g.method),
    howLossesEnded: countBy(losses, (g) => g.method),
    longestWinStreak: winStreak,
    longestLossStreak: lossStreak,
    bestWin: bestWin && gameRef(bestWin),
    worstLoss: worstLoss && gameRef(worstLoss),
    topOpenings,
  };
}
