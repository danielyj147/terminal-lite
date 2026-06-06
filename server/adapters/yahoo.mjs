// Quotes via Yahoo's keyless chart API (covers indices, equities, FX, crypto,
// futures, yields). Unofficial — so: host rotation, per-symbol failure
// tolerance, and the scheduler's stale-cache machinery behind it.
const HOSTS = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];
const UA = 'Mozilla/5.0 (compatible; terminal-lite/0.1; local personal dashboard)';

export async function fetchYahoo(card) {
  const results = await Promise.allSettled(card.symbols.map(fetchQuote));
  const rows = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
  const errors = results
    .filter((r) => r.status === 'rejected')
    .map((r) => r.reason?.message ?? String(r.reason));
  if (errors.length) console.warn(`[yahoo] ${card.id}: ${errors.join('; ')}`);
  if (!rows.length) throw new Error(errors.join('; ') || 'all symbols failed');
  return rows;
}

async function fetchQuote(spec) {
  let lastErr;
  for (const host of HOSTS) {
    try {
      const url = `https://${host}/v8/finance/chart/${encodeURIComponent(spec.sym)}?range=1d&interval=5m`;
      const res = await fetch(url, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`${spec.sym}: HTTP ${res.status}`);
      const meta = (await res.json())?.chart?.result?.[0]?.meta;
      if (meta?.regularMarketPrice == null) throw new Error(`${spec.sym}: no price in response`);

      const price = meta.regularMarketPrice;
      const prev = meta.chartPreviousClose ?? meta.previousClose ?? price;
      return {
        id: spec.sym,
        label: spec.label ?? spec.sym,
        price,
        change: price - prev,
        changePct: prev ? ((price - prev) / prev) * 100 : 0,
        currency: meta.currency,
        marketTime: (meta.regularMarketTime ?? 0) * 1000,
        suffix: spec.suffix,
        dp: spec.dp,
      };
    } catch (err) {
      lastErr = err; // try next host
    }
  }
  throw lastErr ?? new Error(`${spec.sym}: unreachable`);
}
