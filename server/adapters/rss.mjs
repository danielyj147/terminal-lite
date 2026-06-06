// Generic RSS/Atom adapter. A card lists N feeds; per-feed failures are
// tolerated as long as at least one feed yields items.
import { XMLParser } from 'fast-xml-parser';

// processEntities off: big feeds (Axios ~1MB) trip the parser's entity-expansion
// guard. We decode the handful of standard entities ourselves in text().
const parser = new XMLParser({ ignoreAttributes: false, processEntities: false });
const UA = 'Mozilla/5.0 (compatible; terminal-lite/0.1; local personal dashboard)';

export async function fetchRss(card) {
  const results = await Promise.allSettled(card.feeds.map(fetchFeed));
  const items = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  const errors = results
    .filter((r) => r.status === 'rejected')
    .map((r) => r.reason?.message ?? String(r.reason));
  if (errors.length) console.warn(`[rss] ${card.id}: ${errors.join('; ')}`);
  if (!items.length) throw new Error(errors.join('; ') || 'no items from any feed');

  items.sort((a, b) => b.ts - a.ts);
  return items.slice(0, card.maxItems ?? 30);
}

async function fetchFeed(feed) {
  const res = await fetch(feed.url, {
    headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' },
    signal: AbortSignal.timeout(15_000),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`${feed.name}: HTTP ${res.status}`);
  const xml = parser.parse(await res.text());

  const channel = xml?.rss?.channel ?? xml?.feed ?? xml?.['rdf:RDF'];
  if (!channel) throw new Error(`${feed.name}: unrecognized feed format`);
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
        source: feed.name,
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
