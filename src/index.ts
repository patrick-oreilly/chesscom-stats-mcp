#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ChessComError, getArchiveMonths, getMonthGames, getProfile, getStats, type TimeClass } from "./chesscom.js";
import { summarise, toPlayerGame } from "./summary.js";

// Set CHESSCOM_USERNAME in the client config so "how did I do?" works without naming yourself.
const DEFAULT_USERNAME = process.env.CHESSCOM_USERNAME?.trim() || undefined;

const server = new McpServer({ name: "chesscom-stats", version: "0.1.0" });

const username = z
  .string()
  .optional()
  .describe(
    DEFAULT_USERNAME
      ? `Chess.com username. Defaults to "${DEFAULT_USERNAME}" (the user) when omitted.`
      : "Chess.com username.",
  );
const timeClass = z.enum(["bullet", "blitz", "rapid", "daily"]).optional().describe("Only count this time control.");

function resolveUser(name: string | undefined): string {
  const u = name?.trim() || DEFAULT_USERNAME;
  if (!u) throw new Error("No username given and CHESSCOM_USERNAME is not set.");
  return u;
}

const json = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] });

function fail(err: unknown) {
  const message = err instanceof ChessComError || err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

const iso = (unix: number) => new Date(unix * 1000).toISOString().slice(0, 10);

server.registerTool(
  "get_profile",
  {
    title: "Player profile",
    description: "A Chess.com player's public profile: name, country, join date, league, followers.",
    inputSchema: { username },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (args) => {
    try {
      const p = await getProfile(resolveUser(args.username));
      return json({
        username: p.username,
        name: p.name ?? null,
        title: p.title ?? null,
        country: p.country?.split("/").pop() ?? null,
        joined: iso(p.joined),
        lastOnline: iso(p.last_online),
        league: p.league ?? null,
        followers: p.followers,
        status: p.status,
        url: p.url,
      });
    } catch (err) {
      return fail(err);
    }
  },
);

server.registerTool(
  "get_ratings",
  {
    title: "Current ratings",
    description: "Current and best rating plus lifetime win/loss/draw record for each time control (bullet, blitz, rapid, daily).",
    inputSchema: { username },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (args) => {
    try {
      const stats = await getStats(resolveUser(args.username));
      const ratings: { [tc: string]: unknown } = {};
      for (const tc of ["bullet", "blitz", "rapid", "daily"] as TimeClass[]) {
        const block = stats[`chess_${tc}`];
        if (!block) continue;
        ratings[tc] = {
          current: block.last?.rating ?? null,
          best: block.best?.rating ?? null,
          bestDate: block.best ? iso(block.best.date) : null,
          record: block.record ?? null,
        };
      }
      return json({
        ratings,
        tacticsHighest: stats.tactics?.highest?.rating ?? null,
        puzzleRushBest: stats.puzzle_rush?.best?.score ?? null,
      });
    } catch (err) {
      return fail(err);
    }
  },
);

server.registerTool(
  "month_summary",
  {
    title: "Month summary",
    description:
      "How a player did in one calendar month: record and score, rating change per time control, results as white and black, " +
      "average accuracy, how wins and losses ended, streaks, best win, worst loss and most-played openings. " +
      "Defaults to the current month. Use this for questions like \"how did I do this month?\".",
    inputSchema: {
      username,
      year: z.number().int().min(2007).optional().describe("Defaults to the current year."),
      month: z.number().int().min(1).max(12).optional().describe("1-12. Defaults to the current month."),
      time_class: timeClass,
      rated_only: z.boolean().optional().describe("Skip unrated games. Defaults to true."),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (args) => {
    try {
      const user = resolveUser(args.username);
      const now = new Date();
      const year = args.year ?? now.getUTCFullYear();
      const month = args.month ?? now.getUTCMonth() + 1;
      const games = (await getMonthGames(user, year, month))
        .filter((g) => g.rules === "chess")
        .filter((g) => (args.rated_only ?? true ? g.rated : true))
        .filter((g) => !args.time_class || g.time_class === args.time_class)
        .map((g) => toPlayerGame(g, user))
        .filter((g) => g !== null);
      const period = `${year}-${String(month).padStart(2, "0")}`;
      if (!games.length) return json({ username: user, period, games: 0, note: "No matching games this month." });
      return json({ username: user, period, ...summarise(games) });
    } catch (err) {
      return fail(err);
    }
  },
);

server.registerTool(
  "recent_games",
  {
    title: "Recent games",
    description: "A player's most recent finished games, newest first, with result, ratings, opening, accuracy and a link.",
    inputSchema: {
      username,
      limit: z.number().int().min(1).max(50).optional().describe("How many games. Defaults to 10."),
      time_class: timeClass,
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (args) => {
    try {
      const user = resolveUser(args.username);
      const limit = args.limit ?? 10;
      const months = (await getArchiveMonths(user)).reverse();
      const picked = [];
      // Walk back month by month until there are enough games; cap it so a dormant account can't fan out.
      for (const { year, month } of months.slice(0, 6)) {
        const games = (await getMonthGames(user, year, month))
          .filter((g) => !args.time_class || g.time_class === args.time_class)
          .sort((a, b) => b.end_time - a.end_time);
        for (const g of games) {
          const pg = toPlayerGame(g, user);
          if (pg) picked.push(pg);
          if (picked.length === limit) break;
        }
        if (picked.length === limit) break;
      }
      return json(
        picked.map((g) => ({
          date: iso(g.endTime),
          timeClass: g.timeClass,
          color: g.color,
          result: g.outcome,
          method: g.method,
          rating: g.rating,
          opponent: `${g.opponent} (${g.opponentRating})`,
          opening: g.opening,
          accuracy: g.accuracy,
          url: g.url,
        })),
      );
    } catch (err) {
      return fail(err);
    }
  },
);

await server.connect(new StdioServerTransport());
