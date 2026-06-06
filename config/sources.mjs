// terminal-lite — THE source config.
// Every card on the board is an entry here. Adding/removing/editing a source
// never requires touching application code. See CLAUDE.md for the recipe.
//
// Card shape:
//   id       unique string, also the disk-cache filename
//   title    card header text
//   type     adapter name: 'rss' | 'yahoo'  (more added per PLAN.md milestones)
//   cadence  ms between refreshes (per-card; jitter + failure backoff applied automatically)
//   ...      adapter-specific fields (feeds, symbols, ...)

const MIN = 60_000;

export default {
  port: 4321,

  cards: [
    // ── News ────────────────────────────────────────────────────────────
    {
      id: 'news-wires',
      title: 'NEWS · WIRES & MARKETS',
      icon: '📰',
      type: 'rss',
      cadence: 5 * MIN,
      maxItems: 40,
      feeds: [
        { name: 'Axios', url: 'https://api.axios.com/feed/' },
        { name: 'FT', url: 'https://www.ft.com/rss/home' },
        { name: 'Bloomberg', url: 'https://feeds.bloomberg.com/markets/news.rss' },
        // Reuters killed native RSS — proxied through Google News; capped so it can't flood the card
        { name: 'Reuters', url: 'https://news.google.com/rss/search?q=site:reuters.com%20when:1d&hl=en-US&gl=US&ceid=US:en', max: 12 },
      ],
    },
    {
      id: 'news-tech',
      title: 'NEWS · TECH & DEFENSE',
      icon: '🛰️',
      type: 'rss',
      cadence: 10 * MIN,
      maxItems: 40,
      feeds: [
        { name: 'Economist', url: 'https://www.economist.com/latest/rss.xml' },
        { name: 'Ars', url: 'https://feeds.arstechnica.com/arstechnica/index' },
        { name: 'TWZ', url: 'https://www.twz.com/feed' },
        { name: 'SemiAnalysis', url: 'https://semianalysis.com/feed/' },
      ],
    },
    {
      id: 'hackernews',
      title: 'HACKER NEWS · TOP',
      icon: '🟧',
      type: 'hackernews',
      cadence: 5 * MIN,
      count: 20,
    },

    // ── Economic calendar ───────────────────────────────────────────────
    // ForexFactory public weekly JSON. Covers USD/EUR/GBP/JPY/CNY/AUD/NZD/
    // CAD/CHF — no KRW exists in any free calendar feed; Asia coverage is
    // via JPY + CNY. minImpact: 'Low' | 'Medium' | 'High'.
    {
      id: 'econ-cal',
      title: 'ECON CALENDAR',
      icon: '📅',
      type: 'ffcal',
      cadence: 60 * MIN,
      urls: ['https://nfs.faireconomy.media/ff_calendar_thisweek.json'],
      countries: ['USD', 'JPY', 'CNY', 'EUR'],
      minImpact: 'Medium',
      maxItems: 40,
    },

    // ── Markets ─────────────────────────────────────────────────────────
    // cadence may be a number (fixed) or { open, closed, session } where
    // session ∈ 'us' | 'asia' | 'always' (see server/marketHours.mjs).
    // Symbol spec: { sym, label, suffix?, dp? } — sym is a Yahoo Finance symbol.
    {
      id: 'mkt-us',
      title: 'MARKETS · US',
      icon: '🇺🇸',
      type: 'yahoo',
      cadence: { open: 30_000, closed: 5 * MIN, session: 'us' },
      symbols: [
        { sym: '^GSPC', label: 'S&P 500' },
        { sym: '^IXIC', label: 'Nasdaq' },
        { sym: '^VIX', label: 'VIX', dp: 2 },
        { sym: 'BRK-B', label: 'BRK.B' },
        { sym: 'NVDA', label: 'NVDA' },
        { sym: 'TSM', label: 'TSM' },
        { sym: 'PLTR', label: 'PLTR' },
        { sym: 'LMT', label: 'LMT' },
      ],
    },
    {
      id: 'mkt-asia',
      title: 'MARKETS · ASIA',
      icon: '🌏',
      type: 'yahoo',
      cadence: { open: 60_000, closed: 5 * MIN, session: 'asia' },
      symbols: [
        { sym: '^KS11', label: 'KOSPI' },
        { sym: '^N225', label: 'Nikkei 225' },
        { sym: '^HSI', label: 'Hang Seng' },
      ],
    },
    {
      id: 'mkt-rates',
      title: 'RATES · US TREASURIES',
      icon: '🏛️',
      type: 'yahoo',
      cadence: { open: 60_000, closed: 10 * MIN, session: 'us' },
      symbols: [
        { sym: '^IRX', label: '3M Bill', suffix: '%', dp: 3 },
        { sym: '2YY=F', label: '2Y Yield', suffix: '%', dp: 3 },
        { sym: '^FVX', label: '5Y Note', suffix: '%', dp: 3 },
        { sym: '^TNX', label: '10Y Note', suffix: '%', dp: 3 },
        { sym: '^TYX', label: '30Y Bond', suffix: '%', dp: 3 },
      ],
    },
    {
      id: 'mkt-fx',
      title: 'FX · CRYPTO · COMMODITIES',
      icon: '💱',
      type: 'yahoo',
      cadence: { open: 60_000, closed: 60_000, session: 'always' },
      symbols: [
        { sym: 'BTC-USD', label: 'BTC', dp: 0 },
        { sym: 'ETH-USD', label: 'ETH' },
        { sym: 'KRW=X', label: 'USD/KRW', dp: 1 },
        { sym: 'DX-Y.NYB', label: 'DXY' },
        { sym: 'GC=F', label: 'Gold' },
        { sym: 'CL=F', label: 'WTI' },
      ],
    },

    // ── X / social ──────────────────────────────────────────────────────
    // Keyless multi-method fetcher (see server/adapters/x.mjs). Adding or
    // moving a handle is a one-line edit. Optional per-card overrides:
    //   methods: ['syndication','openrss','nitter']   — fallback order
    //   nitterMirrors: ['https://...']                 — last-resort mirrors
    //   perHandle: 5                                   — tweets kept per handle
    {
      id: 'x-ai',
      title: 'X · AI LABS & RESEARCHERS',
      icon: '🤖',
      type: 'x',
      cadence: 15 * MIN,
      maxItems: 40,
      handles: [
        'AnthropicAI', 'claudeai', 'OpenAI', 'sama', 'gdb', 'ilyasut', 'ssi',
        'AIatMeta', 'ylecun', 'demishassabis', 'GoogleDeepMind', 'IsomorphicLabs',
        'AndrewYNg', 'karpathy', 'DrJimFan',
      ],
    },
    {
      id: 'x-defense',
      title: 'X · DEFENSE & SPACE',
      icon: '🚀',
      type: 'x',
      cadence: 15 * MIN,
      maxItems: 25,
      handles: ['anduriltech', 'PalantirTech', 'ssankar', 'SpaceX'],
    },
    {
      id: 'x-dev',
      title: 'X · DEV & TECH',
      icon: '💻',
      type: 'x',
      cadence: 20 * MIN,
      maxItems: 30,
      handles: ['reactjs', 'nextjs', 'ThePrimeagen', 'theo', 'LowLevelTweets', 'PirateSoftware', 'Microsoft'],
    },
    {
      id: 'x-wild',
      title: 'X · WILDCARDS',
      icon: '🃏',
      type: 'x',
      cadence: 20 * MIN,
      maxItems: 25,
      handles: ['elonmusk', 'lexfridman', 'PeteJudo'],
    },
  ],
};
