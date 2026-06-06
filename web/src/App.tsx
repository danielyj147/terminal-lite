import { useEffect, useState } from 'react';
import { Card } from './Card';
import type { Board } from './types';

const POLL_MS = 15_000;

export function App() {
  const [board, setBoard] = useState<Board | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const res = await fetch('/api/board');
        if (res.ok && alive) setBoard(await res.json());
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

  if (!board) return <div className="boot">terminal-lite · connecting…</div>;

  return (
    <div className="grid">
      {board.cards.map((card) => (
        <Card key={card.id} card={card} now={now} />
      ))}
    </div>
  );
}
