# terminal-lite — Requirements

A personal, self-hosted situational-awareness dashboard ("Bloomberg-terminal-lite") for a second monitor. Surfaces live-ish updates across news, markets, an economic calendar, and curated X feeds. Optimized for **glanceability and resilience**, not feature richness.

## 1. Core principles (in priority order)

1. **Glanceable.** Absorb the state of the world in a few seconds. Dense, dark, trading-desk aesthetic — not a content site.
2. **Zero-touch.** Auto-refreshes per source on its own cadence. Never needs interaction to stay current.
3. **Resilient.** No single dead source, rate limit, or layout-shift ever produces a crash, blank panel, or full-page error. Worst case for any card: last-good data, clearly labeled stale with an age badge.
4. **Local-first.** One long-lived process on the user's Mac. No login, no required cloud service to view.
5. **Keyless-first.** Public RSS / JSON endpoints by default. API keys only where no viable keyless path exists; any key is flagged in PLAN.md and isolated in one `.env`.
6. **Config-driven.** Every source, handle, ticker, group, and cadence lives in a single editable config file. Adding/removing a source touches zero application code.

## 2. Target environment

- **Display:** ~27" landscape (1440p/4K), full-screen browser window. Grid sized for 4–5 columns.
- **User locale:** all timestamps rendered in machine-local time (tz-agnostic by design; verified working from EDT).
- **Runtime:** macOS, long-lived local process, single port, one-command start. Viewed at `http://localhost:<port>`.

## 3. Data domains

### 3.1 News / RSS
- Headline feeds via public RSS/Atom: Axios, FT, The Economist, plus additions fitting an AI / defense-tech / semiconductors / markets reader (e.g. Reuters, Bloomberg headlines, Ars Technica, SemiAnalysis-adjacent, The War Zone — final set in PLAN.md).
- Hacker News via the official keyless Firebase API (top stories with points/comments).
- **Paywalled sources: headlines + links only.** No paywall circumvention. Cards link out to the original.

### 3.2 Markets
- Configurable watchlist; keyless quote sources (Stooq CSV, Yahoo Finance public endpoints — tradeoffs documented in PLAN.md).
- **Coverage: US + Asia.**
- Default watchlist:
  - **US indices/risk:** ^GSPC (SPY), ^IXIC (QQQ), ^VIX
  - **Asia indices:** KOSPI, Nikkei 225, Hang Seng
  - **Rates:** US 2Y/10Y Treasury yields; Fed policy-rate context
  - **Single names:** BRK.B, NVDA, TSM, PLTR, LMT
  - **Crypto (24/7):** BTC, ETH — doubles as an "is the board alive" liveness signal
  - **FX / commodities:** USD/KRW, DXY, gold, WTI
- Per-instrument: last price, change, % change, direction color. Market-closed sessions shown as such (not stale).

### 3.3 Economic calendar
- Upcoming releases — CPI, FOMC, NFP, PCE, etc. — with date/time (local), and prior/forecast/actual where the feed provides them.
- **US events primary; Asia-session events (BOK, BOJ, China data) included.**
- Free calendar feed (ForexFactory-style public JSON/XML or equivalent — verified at build time). No paid Trading Economics API.

### 3.4 Social / X
- **Official X API is out of scope** (paid; free tier useless). Instead: a **multi-method fallback fetcher** — try keyless method A, fall back to B, then C. Candidate methods (current viability verified at build time): X's keyless syndication/embed endpoints, FxTwitter-style unauthenticated tweet JSON services, a surviving Nitter mirror (e.g. xcancel) as last resort. The method order itself is configurable.
- Any single method failing must never take down a card; per-handle failures degrade to that handle's last-good tweets.
- Handles are a one-line config edit. Default grouping (4 theme cards, merged chronological feed within each):
  - **AI labs & researchers:** @AnthropicAI @claudeai @OpenAI @sama @gdb @ilyasut @SSI @AIatMeta @ylecun @demishassabis @GoogleDeepMind @IsomorphicLabs @AndrewYNg @karpathy @DrJimFan
  - **Defense & space:** @anduriltech @Palantirtech @ssankar @SpaceX
  - **Dev & tech:** @reactjs @nextjs @ThePrimeagen @theo @LowLevelTweets @PirateSoftware @microsoft
  - **Wildcards:** @elonmusk @lexfridman @PeteJudo

## 4. Refresh cadences (defaults; all config-overridable per source)

| Domain | Cadence |
|---|---|
| Markets | ~30s during relevant market hours; ~5min when closed (crypto always fast) |
| News / HN | ~5min |
| X | ~10–15min, jittered per handle to avoid burst rate-limiting |
| Economic calendar | ~1h |

Backend fetches on these schedules and caches; the frontend polls the backend only. Origin servers are never hit by the browser (also sidesteps CORS).

## 5. UX requirements

- Multi-column responsive grid (4–5 columns at 27" landscape), dark theme, dense typography.
- Each card: **header, source-status indicator, last-updated timestamp, scrollable item list.**
- **Staleness is explicit:** a card whose source is failing shows last-good data + a visible age badge (e.g. "stale · 42m"), visually distinct but never empty.
- **Subtle new-item cue:** unobtrusive highlight when a card has items newer than the last viewport interaction; clears on view.
- Items link out to originals in the default browser.
- **Explicitly NOT in v0:** keyboard shortcuts, manual refresh button, alerts/notifications, read-state sync, mobile layout, auth.

## 6. Resilience requirements

- Last-good payload per source persisted to disk; restart never produces blank cards.
- Per-source fetch isolation: timeout, retry-with-backoff, failure quarantine (a flapping source backs off, doesn't spam).
- Frontend renders whatever the backend has; a source erroring server-side is invisible to the client except via the staleness badge.
- Process supervised enough to survive sleep/wake and network drops (fetch loops self-heal; no manual restart needed for transient failures).

## 7. Configuration

- **One config file** (format chosen in PLAN.md) defining: news feeds (name, URL, card), watchlist (symbol, label, group, source), X handles + groups, calendar regions, per-source cadence overrides, fetch-method ordering for X.
- `.env` only if a keyed source is ever introduced; documented inline. v0 targets **zero keys**.

## 8. Deliverables

1. `REQUIREMENTS.md` (this file)
2. `PLAN.md` — architecture, data-source table (`source → fetch method → auth/key? → cadence → fallback`), milestones
3. Working app, built in thin vertical slices (slice 1: one news feed + one market ticker live end-to-end)
4. `CLAUDE.md` — how to run, where sources are configured, exact steps to add a source
5. Single source-config file
6. One-command run script

## 9. Non-goals

- Multi-user, remote access, or hosting
- Historical charting / analytics (price sparkline is a possible later nicety, not v0)
- Full-article reading experience
- Paywall circumvention
- X posting, replying, or anything requiring an X account
