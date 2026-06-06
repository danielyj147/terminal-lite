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
      title: 'NEWS · WIRES',
      type: 'rss',
      cadence: 5 * MIN,
      maxItems: 30,
      feeds: [
        { name: 'Axios', url: 'https://api.axios.com/feed/' },
      ],
    },

    // ── Markets ─────────────────────────────────────────────────────────
    {
      id: 'mkt-us',
      title: 'MARKETS · US',
      type: 'yahoo',
      cadence: 30_000,
      symbols: [
        { sym: '^GSPC', label: 'S&P 500' },
      ],
    },
  ],
};
