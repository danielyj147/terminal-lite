// Hacker News via the official keyless Firebase API.
// Card config: { count } — number of top stories to show.
const API = 'https://hacker-news.firebaseio.com/v0';

export async function fetchHackerNews(card) {
  const count = card.count ?? 20;
  const ids = await getJson(`${API}/topstories.json`);
  const picked = ids.slice(0, count);
  const results = await Promise.allSettled(picked.map((id) => getJson(`${API}/item/${id}.json`)));
  const items = results
    .flatMap((r) => (r.status === 'fulfilled' && r.value ? [r.value] : []))
    .filter((s) => s.title)
    .map((s) => ({
      id: String(s.id),
      title: s.title,
      url: s.url ?? `https://news.ycombinator.com/item?id=${s.id}`,
      source: `${s.score}pt · ${s.descendants ?? 0}c`,
      commentsUrl: `https://news.ycombinator.com/item?id=${s.id}`,
      ts: (s.time ?? 0) * 1000,
    }));
  if (!items.length) throw new Error('no stories returned');
  return items; // keep rank order — HN's own ranking beats recency here
}

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`HN: HTTP ${res.status}`);
  return res.json();
}
