export type MarketAgentName = "cmc" | "binance" | "browser";
export type MarketProviderName = MarketAgentName;

export interface MarketDataRequest {
  symbol: string;
  timeframe: string;
  providers?: string[];
}

export interface MarketDataRecord {
  source: MarketAgentName;
  symbol: string;
  timeframe: string;
  timestamp: string;
  data: Record<string, unknown>;
}

export interface MarketDataAgent {
  readonly name: MarketAgentName;
  collect(request: MarketDataRequest): Promise<MarketDataRecord[]>;
}

export interface MarketDataError {
  provider: string;
  error: string;
}

export interface MarketDataResponse {
  ok: boolean;
  request: {
    symbol: string;
    timeframe: string;
    providers: string[];
  };
  records: MarketDataRecord[];
  errors: MarketDataError[];
}

export interface MarketDataQuery {
  source?: string;
  symbol?: string;
  timeframe?: string;
  from?: string;
  to?: string;
}

export interface MarketDataStore {
  save(records: MarketDataRecord[]): Promise<void>;
  upsert(records: MarketDataRecord[]): Promise<void>;
  query(query?: MarketDataQuery): Promise<MarketDataRecord[]>;
  all(): Promise<MarketDataRecord[]>;
}

export type FetchLike = typeof fetch;

export interface CmcAgentConfig {
  apiKey: string;
  baseUrl?: string;
  fetcher?: FetchLike;
}

export interface BinanceAgentConfig {
  baseUrl?: string;
  fetcher?: FetchLike;
}

export type BrowserCapture =
  (request: MarketDataRequest) => Promise<MarketDataRecord[]>;
