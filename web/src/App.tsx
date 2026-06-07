import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
        <Ripples />
        <div className="boot">terminal-lite · connecting…</div>
      </>
    );
  }

  return (
    <>
      <Backdrop />
      <Ripples />
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

// Water-like ripple trail following the cursor. Throttled by time + travel
// distance so it stays subtle; each ripple is one compositor-animated ring
// removed from the DOM when its animation ends.
function Ripples() {
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);
  const last = useRef({ x: -999, y: -999, t: 0, id: 0 });

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const now = performance.now();
      const dx = e.clientX - last.current.x;
      const dy = e.clientY - last.current.y;
      if (now - last.current.t < 70 || dx * dx + dy * dy < 900) return;
      const id = ++last.current.id;
      last.current = { x: e.clientX, y: e.clientY, t: now, id };
      setRipples((rs) => [...rs.slice(-11), { id, x: e.clientX, y: e.clientY }]);
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  return (
    <div className="ripples" aria-hidden="true">
      {ripples.map((r) => (
        <span
          key={r.id}
          className="ripple"
          style={{ left: r.x, top: r.y }}
          onAnimationEnd={() => setRipples((rs) => rs.filter((x) => x.id !== r.id))}
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
