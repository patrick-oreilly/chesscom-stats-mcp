import { test } from "node:test";
import assert from "node:assert/strict";
import { openingName, openingFamily, toPlayerGame, summarise } from "../dist/summary.js";

let t = 1_790_000_000;
function game(me, color, { result, method, rating, opp = 1300, tc = "rapid", eco, acc } = {}) {
  const meSide = { username: me, rating, result };
  const themResult = result === "win" ? method : result === "agreed" ? "agreed" : "win";
  const themSide = { username: "Opp", rating: opp, result: themResult };
  return {
    url: `https://www.chess.com/game/live/${t}`,
    end_time: t++,
    rated: true,
    rules: "chess",
    time_class: tc,
    time_control: "600",
    eco,
    accuracies: acc ? { white: acc, black: acc } : undefined,
    white: color === "white" ? meSide : themSide,
    black: color === "black" ? meSide : themSide,
  };
}

test("openingName decodes the ECO slug", () => {
  assert.equal(openingName("https://www.chess.com/openings/Sicilian-Defense-Najdorf-6.Be3"), "Sicilian Defense Najdorf 6.Be3");
  assert.equal(openingName(undefined), null);
  assert.equal(openingFamily("Sicilian Defense Najdorf 6.Be3"), "Sicilian Defense");
  assert.equal(openingFamily("Birds Opening Dutch Variation 2.Nf3"), "Birds Opening");
  assert.equal(openingFamily("Queens Gambit Declined"), "Queens Gambit");
  assert.equal(openingFamily("Birds Opening"), "Birds Opening");
});

test("toPlayerGame matches the username case-insensitively and reads the outcome", () => {
  const g = toPlayerGame(game("Patrick", "black", { result: "checkmated", rating: 1290 }), "patrick");
  assert.equal(g.color, "black");
  assert.equal(g.outcome, "loss");
  assert.equal(g.method, "checkmated");
  assert.equal(toPlayerGame(game("Someone", "white", { result: "win", rating: 1 }), "patrick"), null);
});

test("summarise totals records, ratings, streaks and best win", () => {
  const raw = [
    game("me", "white", { result: "win", method: "resigned", rating: 1310, opp: 1300, eco: "https://www.chess.com/openings/Birds-Opening", acc: 80 }),
    game("me", "white", { result: "win", method: "checkmated", rating: 1320, opp: 1450, eco: "https://www.chess.com/openings/Birds-Opening", acc: 70 }),
    game("me", "black", { result: "timeout", rating: 1312, opp: 1200 }),
    game("me", "black", { result: "agreed", rating: 1311, opp: 1310 }),
    game("me", "white", { result: "win", method: "timeout", rating: 1305, opp: 900, tc: "blitz" }),
  ];
  const s = summarise(raw.map((g) => toPlayerGame(g, "me")));
  assert.deepEqual(s.overall, { games: 5, wins: 3, losses: 1, draws: 1, scorePct: 70 });
  assert.equal(s.byTimeClass.rapid.ratingAfterFirstGame, 1310);
  assert.equal(s.byTimeClass.rapid.ratingAfterLastGame, 1311);
  assert.equal(s.byTimeClass.rapid.ratingChange, 1);
  assert.equal(s.byTimeClass.rapid.peakRating, 1320);
  assert.equal(s.byTimeClass.blitz.games, 1);
  assert.equal(s.longestWinStreak, 2);
  assert.equal(s.bestWin.opponentRating, 1450);
  assert.equal(s.worstLoss.opponentRating, 1200);
  assert.equal(s.averageAccuracy, 75);
  assert.deepEqual(s.howLossesEnded, { timeout: 1 });
  assert.deepEqual(s.topOpenings[0], { opening: "Birds Opening", as: "white", games: 2, wins: 2, losses: 0, draws: 0, scorePct: 100 });
});
