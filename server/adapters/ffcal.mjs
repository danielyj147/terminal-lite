// Economic calendar via ForexFactory's public weekly JSON (faireconomy CDN).
// Card config: { urls, countries?, minImpact?, pastCount?, maxItems? }
// Upcoming events sort first (soonest on top); a short tail of recent past
// events follows so the card is never empty on weekends.
// Note: feed covers USD/EUR/GBP/JPY/CNY/AUD/NZD/CAD/CHF — there is no KRW;
// Asia session coverage comes from JPY + CNY events.
const UA = 'Mozilla/5.0 (compatible; terminal-lite/0.1; local personal dashboard)';
const IMPACT_RANK = { Holiday: 0, Low: 1, Medium: 2, High: 3 };

export async function fetchFfCal(card) {
  const results = await Promise.allSettled(card.urls.map(fetchWeek));
  const all = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  const errors = results
    .filter((r) => r.status === 'rejected')
    .map((r) => r.reason?.message ?? String(r.reason));
  if (errors.length) console.warn(`[ffcal] ${card.id}: ${errors.join('; ')}`);
  if (!all.length) throw new Error(errors.join('; ') || 'no events');

  const minRank = IMPACT_RANK[card.minImpact ?? 'Medium'];
  const countries = card.countries ? new Set(card.countries) : null;
  const now = Date.now();

  const seen = new Set();
  const events = all
    .filter((e) => (IMPACT_RANK[e.impact] ?? 0) >= minRank)
    .filter((e) => !countries || countries.has(e.country))
    .filter((e) => {
      if (seen.has(e.id)) return false; // thisweek/nextweek files can overlap
      seen.add(e.id);
      return true;
    });

  const upcoming = events
    .filter((e) => e.ts >= now)
    .sort((a, b) => a.ts - b.ts || (IMPACT_RANK[b.impact] ?? 0) - (IMPACT_RANK[a.impact] ?? 0));
  const past = events
    .filter((e) => e.ts < now)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, card.pastCount ?? 8);

  return [...upcoming.slice(0, (card.maxItems ?? 40) - past.length), ...past];
}

async function fetchWeek(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`ffcal: HTTP ${res.status}`);
  const raw = await res.json();
  return raw.map((e) => ({
    id: `${e.date}|${e.country}|${e.title}`,
    title: e.title,
    country: e.country,
    impact: e.impact,
    forecast: e.forecast || null,
    previous: e.previous || null,
    ts: Date.parse(e.date),
  }));
}
