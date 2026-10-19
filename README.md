# chesscom-stats-mcp

An [MCP](https://modelcontextprotocol.io) server for Chess.com stats. Plug it into Claude (or any MCP
client) and ask things like:

- "How did I do this month?"
- "What's my score with the Pirc as black?"
- "Show me my last five rapid games."
- "What's Hikaru's bullet rating?"

![Demo: asking Claude how I did on Chess.com this month](demo/demo.gif)

It uses Chess.com's public [Published-Data API](https://www.chess.com/news/view/published-data-api),
so there is no API key and nothing to sign in to. It only reads public data.

## Install

### Claude Code

```bash
claude mcp add chesscom -e CHESSCOM_USERNAME=your_username -- npx -y chesscom-stats-mcp
```

### Claude Desktop, Cursor and other clients

Add this to the client's MCP config (for Claude Desktop, `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "chesscom": {
      "command": "npx",
      "args": ["-y", "chesscom-stats-mcp"],
      "env": { "CHESSCOM_USERNAME": "your_username" }
    }
  }
}
```

`CHESSCOM_USERNAME` is optional. With it set, "how did I do?" means you; without it, name the
player in the question.

## Tools

| Tool | What it returns |
| --- | --- |
| `month_summary` | One month at a glance: win/loss/draw and score %, rating change per time control, results as white and black, average accuracy, how wins and losses ended, longest streaks, best win, worst loss, most-played openings. Defaults to the current month; filter by time control or include unrated games. |
| `recent_games` | The latest games, newest first, with result, ratings, opening, accuracy and a link. |
| `get_ratings` | Current and best rating plus lifetime record for bullet, blitz, rapid and daily. |
| `get_profile` | Public profile: name, country, join date, league, followers. |

All tools are read-only.

## Notes

- Ratings on a Chess.com game are post-game, so a month's `ratingChange` runs from the rating after
  the first rated game of the month to the rating after the last one.
- Accuracy is only present for games that were reviewed on Chess.com, so `averageAccuracy` covers
  `gamesWithAccuracy` games, not all of them.
- Variants (Chess960 and so on) are left out of `month_summary`.

## Development

```bash
npm install
npm test                              # builds, then runs the unit tests
node scripts/demo.mjs list            # list tools over a real stdio connection
node scripts/demo.mjs month_summary '{"username":"hikaru"}'
```

## License

MIT
