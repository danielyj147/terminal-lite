import { useCallback, useEffect, useRef, useState } from 'react';
import { Card } from './Card';
import type { Board } from './types';

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

  if (!board) return <div className="boot">terminal-lite · connecting…</div>;

  return (
    <div className="grid">
      {board.cards.map((card) => (
        <Card
          key={card.id}
          card={card}
          now={now}
          seenIds={seen.current.get(card.id)}
          onSeen={markSeen}
        />
      ))}
    </div>
  );
}
