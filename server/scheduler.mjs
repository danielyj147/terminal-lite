// Per-card fetch loops: independent, jittered, self-healing.
// A failing card backs off exponentially (cap 30min) and serves its last-good
// data as 'stale' — one dead source never affects its siblings.
import { getCard, setCard } from './cache.mjs';

const MAX_BACKOFF = 30 * 60_000;
const adapters = new Map();

export function registerAdapter(type, fn) {
  adapters.set(type, fn);
}

export function startScheduler(cards) {
  for (const card of cards) {
    const adapter = adapters.get(card.type);
    if (!adapter) {
      console.warn(`[sched] no adapter for type "${card.type}" (card ${card.id}) — skipping`);
      continue;
    }
    runLoop(card, adapter);
  }
}

function runLoop(card, adapter) {
  let failures = 0;

  const tick = async () => {
    try {
      const items = await adapter(card);
      setCard(card.id, { items, updatedAt: Date.now(), status: 'ok', lastError: null });
      if (failures > 0) console.log(`[sched] ${card.id} recovered after ${failures} failure(s)`);
      failures = 0;
    } catch (err) {
      failures += 1;
      const prev = getCard(card.id);
      setCard(card.id, {
        items: prev?.items ?? [],
        updatedAt: prev?.updatedAt ?? null,
        status: prev?.items?.length ? 'stale' : 'error',
        lastError: String(err?.message ?? err),
      });
      console.warn(`[sched] ${card.id} failed (x${failures}): ${err?.message ?? err}`);
    }
    const delay = failures
      ? Math.min(card.cadence * 2 ** failures, MAX_BACKOFF)
      : card.cadence;
    setTimeout(tick, delay + delay * 0.1 * Math.random());
  };

  // stagger boot fetches so cards don't fire as one burst
  setTimeout(tick, Math.random() * 2000);
}
