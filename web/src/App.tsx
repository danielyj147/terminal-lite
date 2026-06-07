import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card } from './Card';
import type { Ambient, Board } from './types';

const POLL_MS = 15_000;

function itemId(it: unknown): string {
  return String((it as { id: string }).id);
}

export function App() {
  const [board, setBoard] = useState<Board | null>(null);
  const [now, setNow] = useState(Date.now());
  // per-card ids the user has "seen" (hovering a card marks it seen);
  // seeded on first load so boot doesn't light every card up
  const seen = useRef<Map<string, Set<string>>>(new Map());
  const [, bump] = useState(0);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const res = await fetch('/api/board');
        if (!res.ok || !alive) return;
        const next: Board = await res.json();
        if (seen.current.size === 0) {
          for (const c of next.cards) seen.current.set(c.id, new Set(c.items.map(itemId)));
        } else {
          // prune seen-ids that left the board — without this the sets grow
          // forever in an always-on tab (slow but unbounded memory leak)
          for (const c of next.cards) {
            const live = new Set(c.items.map(itemId));
            const s = seen.current.get(c.id);
            if (s) for (const id of s) if (!live.has(id)) s.delete(id);
          }
        }
        setBoard(next);
      } catch {
        /* backend briefly down — keep rendering last board */
      }
    };
    poll();
    const p = setInterval(poll, POLL_MS);
    const t = setInterval(() => setNow(Date.now()), 1000); // drives age badges
    return () => {
      alive = false;
      clearInterval(p);
      clearInterval(t);
    };
  }, []);

  // ── drag-to-rearrange (persisted to localStorage) ──────────────────
  const [order, setOrder] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('cardOrder') ?? '[]');
    } catch {
      return [];
    }
  });
  const dragId = useRef<string | null>(null);

  const onDropOn = useCallback(
    (targetId: string) => {
      const src = dragId.current;
      dragId.current = null;
      if (!src || src === targetId || !board) return;
      const ids = board.cards.map((c) => c.id);
      const cur = [...order.filter((i) => ids.includes(i)), ...ids.filter((i) => !order.includes(i))];
      const from = cur.indexOf(src);
      const to = cur.indexOf(targetId);
      if (from < 0 || to < 0) return;
      cur.splice(to, 0, ...cur.splice(from, 1));
      setOrder(cur);
      localStorage.setItem('cardOrder', JSON.stringify(cur));
    },
    [board, order],
  );

  const sortedCards = useMemo(() => {
    if (!board) return [];
    const idx = new Map(order.map((id, i) => [id, i]));
    return [...board.cards].sort((a, b) => (idx.get(a.id) ?? 999) - (idx.get(b.id) ?? 999));
  }, [board, order]);

  const markSeen = useCallback(
    (cardId: string) => {
      const card = board?.cards.find((c) => c.id === cardId);
      if (!card) return;
      const set = seen.current.get(cardId) ?? new Set<string>();
      let changed = false;
      for (const it of card.items) {
        const id = itemId(it);
        if (!set.has(id)) {
          set.add(id);
          changed = true;
        }
      }
      seen.current.set(cardId, set);
      if (changed) bump((n) => n + 1);
    },
    [board],
  );

  if (!board) {
    return (
      <>
        <Backdrop />
        <div className="boot">terminal-lite · connecting…</div>
      </>
    );
  }

  return (
    <>
      <Backdrop />
      <WeatherFX ambient={board.ambient} />
      <div className="grid">
        {sortedCards.map((card) => (
          <Card
            key={card.id}
            card={card}
            now={now}
            seenIds={seen.current.get(card.id)}
            onSeen={markSeen}
            onDragStart={(id) => (dragId.current = id)}
            onDropOn={onDropOn}
          />
        ))}
      </div>
    </>
  );
}

// Weather + time-of-day ambience: rendered from live conditions (Open-Meteo,
// keyless, fetched server-side). All elements are CSS-animated with static
// inline params derived from the index — no per-frame JS.
function WeatherFX({ ambient }: { ambient: Ambient | null }) {
  if (!ambient) return null;
  const { condition, isDay } = ambient;
  return (
    <div className={`weatherfx ${isDay ? 'day' : 'night'}`} aria-hidden="true">
      {condition === 'rain' &&
        Array.from({ length: 36 }, (_, i) => (
          <span
            key={i}
            className="drop"
            style={{
              left: `${(i * 37 + 13) % 100}vw`,
              animationDuration: `${0.9 + (i % 5) * 0.22}s`,
              animationDelay: `${-((i * 0.53) % 3)}s`,
            }}
          />
        ))}
      {condition === 'snow' &&
        Array.from({ length: 30 }, (_, i) => (
          <span
            key={i}
            className="flake"
            style={{
              left: `${(i * 41 + 7) % 100}vw`,
              animationDuration: `${7 + (i % 6)}s`,
              animationDelay: `${-((i * 1.7) % 9)}s`,
              opacity: 0.25 + (i % 4) * 0.1,
            }}
          />
        ))}
      {condition === 'wind' &&
        Array.from({ length: 8 }, (_, i) => (
          <span
            key={i}
            className="gust"
            style={{
              top: `${(i * 13 + 5) % 92}vh`,
              animationDuration: `${5 + (i % 4) * 1.5}s`,
              animationDelay: `${-((i * 2.3) % 8)}s`,
            }}
          />
        ))}
      {condition === 'cloudy' &&
        Array.from({ length: 4 }, (_, i) => (
          <span
            key={i}
            className="cloud"
            style={{
              top: `${(i * 19 + 4) % 70}vh`,
              animationDuration: `${90 + i * 25}s`,
              animationDelay: `${-(i * 37)}s`,
            }}
          />
        ))}
      {condition === 'clear' && isDay && <span className="sunglow" />}
      {condition === 'clear' &&
        !isDay &&
        Array.from({ length: 40 }, (_, i) => (
          <span
            key={i}
            className="star"
            style={{
              left: `${(i * 53 + 11) % 100}vw`,
              top: `${(i * 29 + 3) % 55}vh`,
              animationDuration: `${2.5 + (i % 5) * 0.8}s`,
              animationDelay: `${-((i * 0.9) % 4)}s`,
            }}
          />
        ))}
    </div>
  );
}

// Ambient backdrop: drifting blurred orbs + rising glass bubbles behind the
// acrylic cards. Transform/opacity-only animations (compositor work, no
// repaints) keep an always-on board cheap to render.
function Backdrop() {
  return (
    <div className="backdrop" aria-hidden="true">
      <div className="disc disc-1" />
      <div className="disc disc-2" />
      <div className="disc disc-3" />
      <div className="disc disc-4" />
      <div className="disc disc-5" />
      {Array.from({ length: 9 }, (_, i) => (
        <div key={i} className={`bubble bub-${i + 1}`} />
      ))}
    </div>
  );
}
