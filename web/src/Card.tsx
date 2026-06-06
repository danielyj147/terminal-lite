import type { BoardCard, CalEvent, NewsItem, QuoteRow } from './types';

interface CardProps {
  card: BoardCard;
  now: number;
  seenIds?: Set<string>;
  onSeen: (cardId: string) => void;
}

export function Card({ card, now, seenIds, onSeen }: CardProps) {
  // markers only make sense for list-like cards, not quotes/calendar
  const tracksNew = card.kind !== 'yahoo' && card.kind !== 'ffcal';
  const newIds = tracksNew && seenIds
    ? new Set(card.items.map((it) => String((it as NewsItem).id)).filter((id) => !seenIds.has(id)))
    : null;

  return (
    <section className={`card status-${card.status}`} onMouseEnter={() => tracksNew && onSeen(card.id)}>
      <header>
        <h2>
          {card.icon && <span className="icon">{card.icon}</span>}
          {card.title}
        </h2>
        <span className="header-right">
          {newIds && newIds.size > 0 && <span className="new-count">+{newIds.size}</span>}
          {card.sessionOpen === false && <span className="closed">CLOSED</span>}
          <AgeBadge card={card} now={now} />
        </span>
      </header>
      <div className={`card-body kind-${card.kind}`}>
        {card.items.length === 0 ? (
          <div className="empty">{card.status === 'pending' ? 'loading…' : (card.lastError ?? 'no data')}</div>
        ) : card.kind === 'yahoo' ? (
          <QuoteList rows={card.items as QuoteRow[]} />
        ) : card.kind === 'ffcal' ? (
          <CalendarList events={card.items as CalEvent[]} now={now} />
        ) : (
          <NewsList items={card.items as NewsItem[]} now={now} newIds={newIds} />
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

function NewsList({ items, now, newIds }: { items: NewsItem[]; now: number; newIds: Set<string> | null }) {
  return (
    <ul className="news">
      {items.map((it) => (
        <li key={it.id} className={newIds?.has(String(it.id)) ? 'new' : ''}>
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

function CalendarList({ events, now }: { events: CalEvent[]; now: number }) {
  return (
    <table className="cal">
      <tbody>
        {events.map((e) => {
          const past = e.ts < now;
          return (
            <tr key={e.id} className={past ? 'past' : ''}>
              <td className="when">{fmtEventTime(e.ts)}</td>
              <td className={`impact ${e.impact.toLowerCase()}`}>●</td>
              <td className="ctry">{e.country}</td>
              <td className="evt">{e.title}</td>
              <td className="fc">{e.forecast && <>f {e.forecast}</>}</td>
              <td className="fc">{e.previous && <>p {e.previous}</>}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

const TIME_FMT = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function fmtEventTime(ts: number): string {
  return TIME_FMT.format(new Date(ts));
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
