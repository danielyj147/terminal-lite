// X/Twitter timelines without the official API — a multi-method fallback
// fetcher whose design center is resilience (verified landscape, 2026-06):
//
//   1. syndication  — syndication.twitter.com/srv/timeline-profile/screen-name/{h}
//                     Twitter's own embed backend. Full tweet JSON in
//                     __NEXT_DATA__. Engagement-ranked ("top"), so we re-sort
//                     by timestamp. Aggressively burst-rate-limited per IP →
//                     all requests flow through one shared, spaced queue, and
//                     a 429 puts the whole queue on a long cooldown.
//   2. openrss      — openrss.org/x.com/{h}. Public RSS bridge; shared
//                     instance, frequently 429s — works as occasional backup.
//   3. nitter       — surviving public mirrors, RSS. Mostly bot-walled today;
//                     kept as configurable last resort.
//
// The syndication burst limit is tight (observed: a handful of requests, then
// 429 for minutes), so cards refresh handles in ROTATION: each cycle fetches
// only `perCycle` handles per card and serves the rest from the per-handle
// last-good cache. Freshness per handle converges to roughly
// cadence × handles/perCycle — fine for a glanceable board.
//
// Per-handle last-good tweets are kept in memory (seeded from the card's disk
// cache on boot), so a handle whose every method fails degrades to its
// previous items — never an empty card.
//
// Card config: { handles, perHandle?, perCycle?, maxItems?, methods?, nitterMirrors? }
import { getCard } from '../cache.mjs';
import { parseFeedXml } from './rss.mjs';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const DEFAULT_METHODS = ['syndication', 'openrss', 'nitter'];
const DEFAULT_MIRRORS = ['https://rss.xcancel.com', 'https://nitter.privacyredirect.com'];
const SPACING_MS = 8_000; // between any two upstream requests, shared across all X cards
const COOLDOWN_MS = 15 * 60_000; // global pause after a 429

// ── shared request queue ─────────────────────────────────────────────────
let chain = Promise.resolve();
let cooldownUntil = 0;

function enqueue(fn) {
  const run = chain.then(async () => {
    const wait = cooldownUntil - Date.now();
    if (wait > 0) await sleep(wait);
    try {
      return await fn();
    } finally {
      await sleep(SPACING_MS * (0.75 + Math.random() * 0.5));
    }
  });
  chain = run.catch(() => {});
  return run;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── per-handle last-good cache ───────────────────────────────────────────
const handleCache = new Map(); // handle → { items, fetchedAt }
const rotation = new Map(); // cardId → next handle index
const seeded = new Set(); // cardIds whose disk cache was folded in

const cooling = () => Date.now() < cooldownUntil;

// On boot, reconstruct per-handle items from the card's persisted payload so
// a restart doesn't forget handles that won't be re-fetched for a while.
function seedFromDisk(card) {
  if (seeded.has(card.id)) return;
  seeded.add(card.id);
  const prev = getCard(card.id)?.items ?? [];
  for (const h of card.handles) {
    if (handleCache.has(h)) continue;
    const items = prev.filter((i) => i.source === `@${h}`);
    if (items.length) handleCache.set(h, { items, fetchedAt: 0 });
  }
}

// ── adapter entry point ──────────────────────────────────────────────────
export async function fetchX(card) {
  const methods = card.methods ?? DEFAULT_METHODS;
  const perHandle = card.perHandle ?? 5;
  const perCycle = Math.min(card.perCycle ?? 3, card.handles.length);
  seedFromDisk(card);

  // pick this cycle's slice of the rotation (skip entirely during cooldown)
  const toFetch = [];
  if (!cooling()) {
    const start = rotation.get(card.id) ?? 0;
    for (let i = 0; i < perCycle; i++) toFetch.push(card.handles[(start + i) % card.handles.length]);
    rotation.set(card.id, (start + perCycle) % card.handles.length);
  }

  let fresh = 0;
  for (const handle of toFetch) {
    if (cooling()) break;
    for (const method of methods) {
      try {
        const items = await METHODS[method](handle, card);
        if (items?.length) {
          handleCache.set(handle, { items, fetchedAt: Date.now() });
          fresh += 1;
          break;
        }
      } catch (err) {
        if (err?.is429) {
          cooldownUntil = Date.now() + COOLDOWN_MS;
          console.warn(`[x] 429 from ${method} — global cooldown ${COOLDOWN_MS / 60000}min`);
        }
      }
    }
  }

  const merged = card.handles.flatMap((h) => (handleCache.get(h)?.items ?? []).slice(0, perHandle));
  if (toFetch.length && !fresh) {
    console.warn(`[x] ${card.id}: 0/${toFetch.length} handles fetched fresh (@${toFetch.join(', @')})`);
    // nothing fresh and nothing cached → real failure; otherwise serve cache as stale
    if (!merged.length) throw new Error(`all methods failed for @${toFetch.join(', @')}`);
  }
  if (!merged.length) {
    const err = new Error('no tweets cached yet (rate-limit cooldown?)');
    // retry shortly after the cooldown lapses rather than exponential backoff
    if (cooling()) err.retryMs = cooldownUntil - Date.now() + 30_000;
    throw err;
  }

  merged.sort((a, b) => b.ts - a.ts);
  return merged.slice(0, card.maxItems ?? 30);
}

// ── methods ──────────────────────────────────────────────────────────────
const METHODS = {
  async syndication(handle) {
    const html = await enqueue(async () => {
      const res = await fetch(
        `https://syndication.twitter.com/srv/timeline-profile/screen-name/${encodeURIComponent(handle)}`,
        { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20_000) },
      );
      if (res.status === 429) throw Object.assign(new Error('429'), { is429: true });
      if (!res.ok) throw new Error(`syndication ${handle}: HTTP ${res.status}`);
      return res.text();
    });
    const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s);
    if (!m) throw new Error(`syndication ${handle}: no __NEXT_DATA__`);
    const entries = JSON.parse(m[1])?.props?.pageProps?.timeline?.entries ?? [];
    return entries
      .map((e) => e.content?.tweet)
      .filter((t) => t?.full_text && t.id_str)
      .map((t) => ({
        id: t.id_str,
        title: (t.retweeted_status ? `RT @${t.retweeted_status.user?.screen_name}: ` : '') + decode(t.full_text),
        url: `https://x.com${t.permalink ?? `/${handle}/status/${t.id_str}`}`,
        source: `@${handle}`,
        ts: Date.parse(t.created_at) || 0,
      }))
      .sort((a, b) => b.ts - a.ts);
  },

  async openrss(handle) {
    const xml = await enqueue(async () => {
      const res = await fetch(`https://openrss.org/x.com/${encodeURIComponent(handle)}`, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(20_000),
      });
      if (res.status === 429) throw Object.assign(new Error('429'), { is429: true });
      if (!res.ok) throw new Error(`openrss ${handle}: HTTP ${res.status}`);
      return res.text();
    });
    return normalizeRssTweets(xml, handle);
  },

  async nitter(handle, card) {
    const mirrors = card.nitterMirrors ?? DEFAULT_MIRRORS;
    let lastErr;
    for (const base of mirrors) {
      try {
        const xml = await enqueue(async () => {
          const res = await fetch(`${base}/${encodeURIComponent(handle)}/rss`, {
            headers: { 'User-Agent': UA },
            signal: AbortSignal.timeout(15_000),
          });
          if (!res.ok) throw new Error(`nitter ${base} ${handle}: HTTP ${res.status}`);
          const text = await res.text();
          if (!text.includes('<rss') && !text.includes('<feed')) {
            throw new Error(`nitter ${base} ${handle}: not a feed (bot wall?)`);
          }
          return text;
        });
        const items = normalizeRssTweets(xml, handle);
        if (items.length) return items;
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr ?? new Error(`nitter ${handle}: no mirror worked`);
  },
};

function normalizeRssTweets(xml, handle) {
  return parseFeedXml(xml, `@${handle}`)
    .map((it) => ({
      ...it,
      // rewrite mirror links back to x.com
      url: it.url?.replace(/^https?:\/\/[^/]+\//, 'https://x.com/').replace(/#m$/, ''),
    }))
    .filter((it) => it.ts > Date.parse('2000-01-01')) // drop placeholder dates from broken mirrors
    .sort((a, b) => b.ts - a.ts);
}

function decode(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}
