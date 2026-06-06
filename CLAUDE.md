# terminal-lite

Self-hosted situational-awareness dashboard ("Bloomberg-terminal-lite") for a second monitor. News + markets + econ calendar + X feeds, glanceable and resilient, **zero API keys**.

## Run

```bash
./run.sh            # installs deps if missing, builds frontend if missing, starts server
./run.sh --build    # force frontend rebuild (after editing web/)
```

Board: **http://localhost:4321** (port set in `config/sources.mjs`).

Dev mode (frontend hot reload): `npm run dev:server` + `npm run dev:web` (Vite on :5173 proxies `/api`).

Config changes (`config/sources.mjs`) need only a server restart — no rebuild. Frontend changes (`web/src/`) need `./run.sh --build`.

## Architecture (one Node process)

```
scheduler (per-card loop, jitter, exp backoff) → adapter → cache (memory + data/cache/*.json)
                                                                ↓
browser polls GET /api/board ←——— Hono serves API + web/dist ———┘
```

- `server/scheduler.mjs` — independent per-card fetch loops. Failure ⇒ exponential backoff (cap 30 min) + card marked `stale`/`error`, last-good items still served. One dead source never affects siblings.
- `server/cache.mjs` — in-memory map persisted to `data/cache/<cardId>.json`; restarts never blank the board.
- `server/marketHours.mjs` — session-aware cadence (`us` / `asia` / `always`): fast while open, slow while closed.
- `server/adapters/` — one file per source type: `rss`, `yahoo`, `hackernews`, `ffcal`, `x`.
- `web/` — Vite + React + TS. Polls `/api/board` every 15 s; renders whatever the backend has. Staleness is a badge, never a blank panel.

## Where sources are configured

**Everything lives in `config/sources.mjs`** — one card per entry. Common fields:
`id` (unique, also cache filename), `title`, `icon` (header emoji), `type` (adapter), `cadence` (ms, or `{ open, closed, session }`).

Per-type fields:

| type | fields |
|---|---|
| `rss` | `feeds: [{ name, url, max? }]`, `maxItems`, `minPerFeed` (fair-merge guarantee, default 3) |
| `yahoo` | `symbols: [{ sym, label, suffix?, dp? }]` — `sym` is any Yahoo Finance symbol |
| `hackernews` | `count` |
| `ffcal` | `urls`, `countries` (currency codes), `minImpact` ('Low'/'Medium'/'High'), `pastCount` |
| `x` | `handles: ['name', …]`, `perHandle`, `maxItems`, `methods?`, `nitterMirrors?` |

## Adding a new source — exact steps

**Existing type (the usual case):** add one entry to the `cards` array in `config/sources.mjs`, restart. E.g. another news feed → append to a card's `feeds`, or add a whole new card with a fresh `id`. A new X handle → one line in some card's `handles`.

**New source type:**
1. Create `server/adapters/<name>.mjs` exporting `async fetch<Name>(card)` → returns an items array (throw on total failure; the scheduler handles stale-serving and backoff). Items for list cards: `{ id, title, url, source, ts }`.
2. Register it in `server/index.mjs`: `registerAdapter('<name>', fetch<Name>)`.
3. Add a card with `type: '<name>'` to the config.
4. If it needs a custom renderer, add a branch on `card.kind` in `web/src/Card.tsx` (default renderer is the news list) and rebuild.

## X fetcher notes (server/adapters/x.mjs)

Keyless, multi-method, ordered fallback per handle: **syndication** (Twitter's embed backend; engagement-ranked so we re-sort by ts; burst-rate-limited → all requests share one spaced queue, 429 triggers a 15-min global cooldown) → **openrss** → **nitter mirrors**. Per-handle last-good tweets are cached in memory; a handle whose methods all fail serves its previous items. First full sweep after boot takes a few minutes by design (~8 s spacing); cards show `loading…` until their sweep lands. These endpoints shift — if a method dies, adjust `methods`/`nitterMirrors` in config first, code second.

## Gotchas

- Yahoo's chart API is unofficial. Adapter rotates query1/query2 hosts; if it breaks entirely, check the per-class fallbacks listed in PLAN.md §2.
- ForexFactory's `nextweek.json` 404s except around week rollover — only `thisweek` is configured; the calendar shows a dimmed tail of recent past events on weekends.
- Reuters has no native RSS; it's proxied via Google News RSS (capped with `max` so it can't flood the card).
- `data/cache/` is gitignored; deleting it is safe (cards repopulate on next fetch).
- Restart the server with: `lsof -ti :4321 | xargs kill; ./run.sh`.
