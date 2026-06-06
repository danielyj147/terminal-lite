# terminal-lite — Plan

## 1. Stack

| Layer | Choice | Why |
|---|---|---|
| Runtime | Node 20+ (single process) | Long-lived local process; no build step needed server-side |
| Backend | **Hono** (tiny router) + native `fetch` | ~50KB dep; serves API + static frontend on one port |
| Scheduler | Hand-rolled per-source loop (`setTimeout` chain + backoff) | A cron lib is overkill; self-healing loops are ~40 lines |
| RSS parsing | `fast-xml-parser` | Small, no native deps |
| Cache | In-memory + JSON files under `data/cache/` | Survives restarts; no DB |
| Frontend | **React + Vite + TypeScript** | You know React; Vite build output is static files served by Hono |
| Styling | Hand-rolled CSS (CSS grid + custom props) | A dark dense grid doesn't need Tailwind; zero framework lock-in |
| Config | `config/sources.mjs` (plain JS module) | Comments + trailing commas + zero parser deps; still pure config |

**Total runtime deps: ~3** (hono, fast-xml-parser, react/react-dom). No keys, no `.env` needed in v0.

### Architecture

```
┌─────────────────────────── one Node process, one port ──────────────────────────┐
│  scheduler ──▶ source adapters ──▶ normalizer ──▶ cache (memory + disk JSON)    │
│   (per-source loop,   rss / hackernews /            │                            │
│    jitter, backoff,   yahoo / x-multi /             ▼                            │
│    quarantine)        ffcalendar                GET /api/board  ◀── browser polls │
│                                                 (all cards, one payload)         │
│                                                 GET /  ◀── static built frontend │
└──────────────────────────────────────────────────────────────────────────────────┘
```

- **The browser only ever talks to the backend** (kills CORS, centralizes caching/rate-limiting).
- Frontend polls `GET /api/board` every ~15s — cheap, it's localhost reading memory.
- Every card payload carries `{ items, updatedAt, status: ok|stale|error, lastError? }`. Frontend renders whatever it gets; staleness is a badge, never a blank.
- A failing source enters exponential backoff (cap ~30min) without affecting siblings; its last-good disk cache keeps serving.

## 2. Data-source table

✅ = verified working keyless on 2026-06-06.

| Source | Fetch method | Key? | Cadence | Fallback |
|---|---|---|---|---|
| Axios | ✅ RSS `api.axios.com/feed/` | No | 5min | stale cache |
| FT | ✅ RSS `ft.com/rss/home` (headlines only) | No | 5min | stale cache |
| The Economist | ✅ RSS `economist.com/latest/rss.xml` | No | 15min | stale cache |
| Bloomberg headlines | RSS `feeds.bloomberg.com/markets/news.rss` | No | 5min | stale cache |
| Ars Technica | ✅ RSS | No | 10min | stale cache |
| Reuters | Google News RSS proxy (`news.google.com/rss/search?q=site:reuters.com+...`) — Reuters killed native RSS | No | 10min | stale cache |
| The War Zone (defense) | RSS `twz.com/feed` | No | 15min | stale cache |
| SemiAnalysis (semis) | RSS `semianalysis.com/feed/` | No | 1h | stale cache |
| Hacker News | ✅ Firebase API `hacker-news.firebaseio.com/v0/` | No | 5min | Algolia HN API (also keyless) |
| **Markets — all classes** | ✅ Yahoo chart API `query1.finance.yahoo.com/v8/finance/chart/{sym}` — covers US/Asia indices, single names, BTC-USD, KRW=X, GC=F, CL=F, ^TNX in one endpoint | No | 30s open / 5min closed | host rotation → `query2`; per-class fallbacks below |
| └ Crypto fallback | CoinGecko `api.coingecko.com/api/v3/simple/price` | No | (fallback) | stale cache |
| └ FX fallback | frankfurter.app (ECB rates) | No | (fallback) | stale cache |
| └ Yields fallback | US Treasury daily yield-curve XML (treasury.gov, official, keyless) | No | (fallback) | stale cache |
| └ ~~Stooq~~ | ❌ Now behind JS bot-wall (verified) — **dropped**, kept in config as disabled entry | — | — | — |
| Econ calendar | ✅ ForexFactory JSON `nfs.faireconomy.media/ff_calendar_thisweek.json` (incl. prior/forecast/actual, BOJ/China events) | No | 1h | serve cached week; weekly XML variant |
| **X timelines** | Method chain, per handle, first success wins:<br>**1.** ✅ Syndication `syndication.twitter.com/srv/timeline-profile/screen-name/{h}` — Twitter's own embed backend; returns `__NEXT_DATA__` JSON with full tweets (verified: real tweet text)<br>**2.** Nitter-mirror RSS (`xcancel.com/{h}/rss` + configurable mirror list) — ⚠️ verified flaky (302s), last resort<br>**3.** FxTwitter `api.fxtwitter.com` — ✅ works but per-tweet/profile only; used to enrich/repair items, not as a timeline source | No | 10–15min, jittered per handle | per-handle stale cache; method order is config |

### Known tradeoffs (eyes open)

- **Yahoo chart API is unofficial.** It's been stable for years and needs no cookie/crumb (unlike `v7/quote`, which now does), but it can change without notice. Mitigation: host rotation, per-class keyless fallbacks, stale-tolerant cards. This is still strictly better than any keyed alternative under the zero-key constraint.
- **X syndication endpoint** is Twitter's own embed infrastructure — likeliest to keep working keyless, but it has historically gained/lost token requirements. The fetcher treats *every* method as optional; worst case a handle's card goes stale, never blank.
- **ForexFactory JSON** is an undocumented-but-long-lived public feed. Calendar data changes slowly; a week-old cache is still mostly right.

## 3. Layout (27" landscape, 4–5 columns)

```
┌─ MARKETS (US) ─┬─ MARKETS (Asia/FX/₿) ─┬─ NEWS: Wires ──┬─ X: AI labs ───┬─ X: Defense ─┐
│ tape-style     │ KOSPI N225 HSI        │ Axios FT Bloom │ merged feed    │ merged feed  │
│ rows w/ Δ%     │ KRW DXY BTC ETH gold  │ Reuters        │                │              │
├─ YIELDS/RATES ─┼─ ECON CALENDAR ───────┼─ NEWS: Tech ───┼─ X: Dev ───────┼─ X: Wild ────┤
│ 2Y 10Y curve   │ upcoming releases     │ HN ArsTechnica │ merged feed    │ merged feed  │
│                │ w/ prior/forecast     │ TWZ SemiAnal.  │                │              │
└────────────────┴───────────────────────┴────────────────┴────────────────┴──────────────┘
```

Card assignment lives in config; the grid auto-flows.

## 4. Milestones (one commit per working slice)

| # | Slice | Definition of done |
|---|---|---|
| **M1** | **Walking skeleton** | `./run.sh` opens a dark board with **two real live cards**: Axios headlines + ^GSPC quote. Scheduler, cache, disk persistence, `/api/board`, staleness badge all real — just for 2 sources. |
| M2 | Full markets | Watchlist groups (US / Asia / FX-crypto-cmdty / yields), market-hours-aware cadence, closed-session display. |
| M3 | All news + HN | Remaining RSS feeds + HN card with points/comments. Per-feed failure isolation proven (kill one feed, board unaffected). |
| M4 | Econ calendar | FF feed, local-time display, US+Asia filter, prior/forecast/actual columns. |
| M5 | X cards | Multi-method fetcher + 4 theme cards, per-handle jitter + quarantine, method-order in config. |
| M6 | Polish + docs | New-item visual cue, layout tuning at 1440p, `CLAUDE.md` (run / configure / add-a-source recipe), final README touches. |

Slices M2–M5 are independent after M1 — order can shuffle if a source fights back.

## 5. Project layout

```
terminal-lite/
├── config/sources.mjs      # THE config: feeds, watchlist, handles, groups, cadences, X method order
├── server/
│   ├── index.mjs           # Hono app: /api/board + static
│   ├── scheduler.mjs       # per-source loops, jitter, backoff, quarantine
│   ├── cache.mjs           # memory + data/cache/*.json persistence
│   └── adapters/           # one file per fetch method: rss, hn, yahoo, x, ffcal
├── web/                    # Vite + React + TS → builds to web/dist (served by Hono)
├── data/cache/             # last-good payloads (gitignored)
├── run.sh                  # the one command
├── REQUIREMENTS.md / PLAN.md / CLAUDE.md
```

---

**Sign off and I start M1.**
