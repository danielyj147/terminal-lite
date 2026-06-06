// In-memory card cache with JSON-file persistence so restarts never blank the board.
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';

const DIR = new URL('../data/cache/', import.meta.url);
const mem = new Map();

export async function initCache() {
  await mkdir(DIR, { recursive: true });
  try {
    for (const f of await readdir(DIR)) {
      if (!f.endsWith('.json')) continue;
      try {
        const payload = JSON.parse(await readFile(new URL(f, DIR), 'utf8'));
        // Anything loaded from disk is by definition not fresh.
        if (payload.status === 'ok') payload.status = 'stale';
        mem.set(f.slice(0, -5), payload);
      } catch { /* one corrupt cache file must not block boot */ }
    }
  } catch { /* missing dir already handled by mkdir */ }
}

export function getCard(id) {
  return mem.get(id);
}

export function setCard(id, payload) {
  mem.set(id, payload);
  // fire-and-forget persistence; the board reads from memory
  writeFile(new URL(`${id}.json`, DIR), JSON.stringify(payload)).catch(() => {});
}
