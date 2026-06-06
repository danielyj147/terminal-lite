import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import config from '../config/sources.mjs';
import { initCache, getCard } from './cache.mjs';
import { currentCadence, sessionOpenFor } from './marketHours.mjs';
import { registerAdapter, startScheduler } from './scheduler.mjs';
import { fetchFfCal } from './adapters/ffcal.mjs';
import { fetchHackerNews } from './adapters/hackernews.mjs';
import { fetchRss } from './adapters/rss.mjs';
import { fetchYahoo } from './adapters/yahoo.mjs';

registerAdapter('rss', fetchRss);
registerAdapter('yahoo', fetchYahoo);
registerAdapter('hackernews', fetchHackerNews);
registerAdapter('ffcal', fetchFfCal);

await initCache();
startScheduler(config.cards);

const app = new Hono();

app.get('/api/board', (c) =>
  c.json({
    generatedAt: Date.now(),
    cards: config.cards.map((card) => {
      const data = getCard(card.id);
      return {
        id: card.id,
        title: card.title,
        kind: card.type,
        cadence: currentCadence(card.cadence),
        sessionOpen: sessionOpenFor(card.cadence),
        updatedAt: data?.updatedAt ?? null,
        status: data?.status ?? 'pending',
        lastError: data?.lastError ?? null,
        items: data?.items ?? [],
      };
    }),
  }),
);

app.use('*', serveStatic({ root: './web/dist' }));

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`terminal-lite → http://localhost:${info.port}`);
});
