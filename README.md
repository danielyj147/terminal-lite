# terminal-lite

A self-hosted, keyless **situational-awareness dashboard** for a second monitor — a Bloomberg-terminal-lite. One glance absorbs world news, markets, the economic calendar, and curated X feeds; it keeps itself current with zero interaction.

```
┌─ 📰 WIRES ─────┬─ 🇺🇸 MARKETS US ─┬─ 🏛️ RATES ───────┬─ 🤖 X · AI LABS ──┐
│ Axios FT       │ S&P 500  -2.64%  │ 2Y 3.800%        │ @AnthropicAI      │
│ Bloomberg      │ NVDA     -6.20%  │ 10Y 4.536%       │ @OpenAI @karpathy │
│ Reuters        │ VIX     +39.68%  ├─ 📅 ECON CAL ────┼─ 🚀 X · DEFENSE ──┤
├─ 🟧 HN ────────┼─ 🌏 ASIA ────────┤ Wed CPI f=2.8%   │ @anduriltech      │
│ top stories    │ KOSPI Nikkei HSI │ Thu FOMC         │ @SpaceX @ssankar  │
└────────────────┴──────────────────┴──────────────────┴───────────────────┘
```

## Design principles

- **Glanceable** — dense, dark, trading-desk aesthetic; 4–5 column grid sized for a 27" monitor.
- **Zero-touch** — every source refreshes on its own cadence (markets 30–60s in session, news 5–10min, X rotating, calendar hourly). Price ticks flash; unseen items hold an accent until you hover.
- **Resilient** — a dead or rate-limited source shows its last-good data with a stale badge. Never a crash, blank panel, or full-page error. Caches persist to disk, so restarts never blank the board.
- **Keyless** — public RSS, official free APIs, and public JSON endpoints only. **No API keys, no accounts, no cost.**
- **Config-driven** — every feed, ticker, X handle, and cadence lives in [`config/sources.mjs`](config/sources.mjs). Adding a source touches zero application code.

## Quick start

```bash
git clone https://github.com/danielyj147/terminal-lite && cd terminal-lite
./run.sh
```

Open **http://localhost:4321**. Requires Node 20+.

## What's on the board

| Domain | Sources | Method |
|---|---|---|
| News | Axios, FT, Bloomberg, Reuters, Economist, Ars Technica, The War Zone, SemiAnalysis | public RSS (Reuters via Google News proxy) |
| Hacker News | top stories, points + comments | official Firebase API |
| Markets | US/Asia indices, single names, US Treasury yields, FX (KRW/JPY crosses), BTC/ETH, energy/metals/grains | Yahoo Finance chart API (keyless), host rotation |
| Econ calendar | CPI, FOMC, NFP, PCE… with forecast/prior, impact-coded | ForexFactory public weekly JSON |
| X / Twitter | ~30 curated handles in 4 theme cards | multi-method keyless fetcher (see below) |

## The X fetcher

The official X API has no free tier and reading ~30 timelines would cost hundreds of dollars monthly, so `server/adapters/x.mjs` chains keyless methods per handle — **syndication** (Twitter's own embed backend) → **OpenRSS** → **Nitter mirrors** — through one rate-limit-aware queue: requests are spaced ~30s apart, a 429 ices only the offending method, and every handle keeps its last-good tweets so a failing method degrades to slightly-older content instead of an empty card. Handles refresh in round-robin; expect roughly hourly freshness per handle — the honest ceiling of keyless X access.

## Architecture

One Node process, ~3 runtime dependencies:

```
scheduler (per-card loop, jitter, backoff) → adapters (rss/yahoo/hn/ffcal/x)
        ↓ memory + disk cache (data/cache/)
browser ← GET /api/board ← Hono (also serves the built Vite/React frontend)
```

The browser only ever polls the local backend — origin servers see one well-behaved client regardless of how many tabs you open, and CORS never enters the picture.

## Configuration

Everything is in **`config/sources.mjs`** — add a feed, ticker, or X handle with a one-line edit and restart. Card types and their fields are documented inline. Frontend changes need `./run.sh --build`; config changes just need a restart.

## Docs

- [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md) — what this is and isn't
- [`docs/PLAN.md`](docs/PLAN.md) — architecture decisions, source-by-source fetch/fallback table, verified-at-build-time endpoint notes
