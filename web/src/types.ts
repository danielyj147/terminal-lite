export interface NewsItem {
  id: string;
  title: string;
  url?: string;
  source: string;
  ts: number;
}

export interface QuoteRow {
  id: string;
  label: string;
  price: number;
  change: number;
  changePct: number;
  currency?: string;
  marketTime: number;
}

export interface BoardCard {
  id: string;
  title: string;
  kind: string;
  cadence: number;
  updatedAt: number | null;
  status: 'ok' | 'stale' | 'error' | 'pending';
  lastError: string | null;
  items: unknown[];
}

export interface Board {
  generatedAt: number;
  cards: BoardCard[];
}
