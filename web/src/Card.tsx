import type { BoardCard, NewsItem, QuoteRow } from './types';

export function Card({ card, now }: { card: BoardCard; now: number }) {
  return (
    <section className={`card status-${card.status}`}>
      <header>
        <h2>{card.title}</h2>
        <span className="header-right">
          {card.sessionOpen === false && <span className="closed">CLOSED</span>}
          <AgeBadge card={card} now={now} />
        </span>
      </header>
      <div className="card-body">
        {card.items.length === 0 ? (
          <div className="empty">{card.status === 'pending' ? 'loading…' : (card.lastError ?? 'no data')}</div>
        ) : card.kind === 'yahoo' ? (
          <QuoteList rows={card.items as QuoteRow[]} />
        ) : (
          <NewsList items={card.items as NewsItem[]} now={now} />
        )}
      </div>
    </section>
  );
}

function AgeBadge({ card, now }: { card: BoardCard; now: number }) {
  if (card.updatedAt == null) return <span className="badge err">{card.status === 'pending' ? '…' : 'ERR'}</span>;
  const age = now - card.updatedAt;
  // a card is visibly stale once it has missed ~3 refresh cycles
  const stale = card.status !== 'ok' || age > card.cadence * 3;
  return (
    <span className={`badge ${stale ? 'stale' : 'ok'}`} title={card.lastError ?? undefined}>
      {stale ? 'stale · ' : ''}
      {fmtAge(age)}
    </span>
  );
}

function NewsList({ items, now }: { items: NewsItem[]; now: number }) {
  return (
    <ul className="news">
      {items.map((it) => (
        <li key={it.id}>
          <span className="ts">{fmtAge(now - it.ts)}</span>
          <span className="src">{it.source}</span>
          <a href={it.url} target="_blank" rel="noreferrer">
            {it.title}
          </a>
        </li>
      ))}
    </ul>
  );
}

function QuoteList({ rows }: { rows: QuoteRow[] }) {
  return (
    <table className="quotes">
      <tbody>
        {rows.map((r) => {
          const dir = r.change > 0 ? 'up' : r.change < 0 ? 'down' : 'flat';
          return (
            <tr key={r.id}>
              <td className="label">{r.label}</td>
              <td className="px">
                {fmtPrice(r.price, r.dp)}
                {r.suffix ?? ''}
              </td>
              <td className={`chg ${dir}`}>
                {r.change >= 0 ? '+' : ''}
                {fmtPrice(r.change, r.dp)}
              </td>
              <td className={`chg ${dir}`}>
                {r.changePct >= 0 ? '+' : ''}
                {r.changePct.toFixed(2)}%
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function fmtPrice(n: number, dp?: number): string {
  const abs = Math.abs(n);
  const digits = dp ?? (abs >= 10 ? 2 : 4);
  return n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function fmtAge(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
