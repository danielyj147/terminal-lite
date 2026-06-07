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
  suffix?: string;
  dp?: number;
}

export interface CalEvent {
  id: string;
  title: string;
  country: string;
  impact: 'High' | 'Medium' | 'Low' | 'Holiday';
  forecast: string | null;
  previous: string | null;
  ts: number;
}

export interface BoardCard {
  id: string;
  title: string;
  icon: string | null;
  kind: string;
  cadence: number;
  sessionOpen: boolean | null;
  updatedAt: number | null;
  status: 'ok' | 'stale' | 'error' | 'pending';
  lastError: string | null;
  items: unknown[];
}

export interface Ambient {
  condition: 'rain' | 'snow' | 'wind' | 'cloudy' | 'clear';
  isDay: boolean;
  temp: number;
  wind: number;
  cloud: number;
}

export interface Board {
  generatedAt: number;
  ambient: Ambient | null;
  cards: BoardCard[];
}
