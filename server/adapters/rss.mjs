// Generic RSS/Atom adapter. A card lists N feeds; per-feed failures are
// tolerated as long as at least one feed yields items.
import { XMLParser } from 'fast-xml-parser';

// processEntities off: big feeds (Axios ~1MB) trip the parser's entity-expansion
// guard. We decode the handful of standard entities ourselves in text().
const parser = new XMLParser({ ignoreAttributes: false, processEntities: false });
const UA = 'Mozilla/5.0 (compatible; terminal-lite/0.1; local personal dashboard)';

export async function fetchRss(card) {
  const results = await Promise.allSettled(
    card.feeds.map(async (feed) => ({ feed, items: await fetchFeed(feed) })),
  );
  const errors = results
    .filter((r) => r.status === 'rejected')
    .map((r) => r.reason?.message ?? String(r.reason));
  if (errors.length) console.warn(`[rss] ${card.id}: ${errors.join('; ')}`);

  // Fair merge: a high-frequency feed must not drown the card.
  // 1) cap each feed at its newest `feed.max` items (if set)
  // 2) guarantee every live feed its newest `minPerFeed` items
  // 3) fill remaining slots by recency across all feeds
  const minPer = card.minPerFeed ?? 3;
  const guaranteed = [];
  const rest = [];
  for (const r of results) {
    if (r.status !== 'fulfilled' || !r.value.items.length) continue;
    const capped = [...r.value.items]
      .sort((a, b) => b.ts - a.ts)
      .slice(0, r.value.feed.max ?? Infinity);
    guaranteed.push(...capped.slice(0, minPer));
    rest.push(...capped.slice(minPer));
  }
  if (!guaranteed.length) throw new Error(errors.join('; ') || 'no items from any feed');

  rest.sort((a, b) => b.ts - a.ts);
  const max = card.maxItems ?? 30;
  const items = [...guaranteed, ...rest.slice(0, Math.max(0, max - guaranteed.length))];
  items.sort((a, b) => b.ts - a.ts);
  return items;
}

async function fetchFeed(feed) {
  const res = await fetch(feed.url, {
    headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' },
    signal: AbortSignal.timeout(15_000),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`${feed.name}: HTTP ${res.status}`);
  return parseFeedXml(await res.text(), feed.name);
}

// Parse RSS/Atom/RDF text into normalized items. Exported for reuse by other
// adapters that receive feed XML from non-standard transports (e.g. X mirrors).
export function parseFeedXml(xmlText, sourceName) {
  const xml = parser.parse(xmlText);
  const channel = xml?.rss?.channel ?? xml?.feed ?? xml?.['rdf:RDF'];
  if (!channel) throw new Error(`${sourceName}: unrecognized feed format`);
  let raw = channel.item ?? channel.entry ?? xml?.['rdf:RDF']?.item ?? [];
  if (!Array.isArray(raw)) raw = [raw];

  return raw
    .map((it) => {
      const title = text(it.title);
      const url = linkOf(it.link);
      return {
        id: text(it.guid) ?? it.id ?? url ?? title,
        title,
        url,
        source: sourceName,
        ts: Date.parse(it.pubDate ?? it.published ?? it.updated ?? it['dc:date'] ?? '') || Date.now(),
      };
    })
    .filter((i) => i.title);
}

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&#39;': "'", '&#x27;': "'" };

function text(v) {
  if (v == null) return undefined;
  if (typeof v === 'object') v = v['#text'];
  if (v == null) return undefined;
  return String(v)
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/&(?:amp|lt|gt|quot|apos|#39|#x27);/g, (m) => ENTITIES[m])
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .trim();
}

function linkOf(link) {
  if (link == null) return undefined;
  if (Array.isArray(link)) {
    const alt = link.find((l) => l['@_rel'] === 'alternate' || !l['@_rel']);
    return alt?.['@_href'] ?? text(alt);
  }
  if (typeof link === 'object') return link['@_href'] ?? text(link);
  return String(link);
}
