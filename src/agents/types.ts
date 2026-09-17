export type MarketAgentName = "cmc" | "binance" | "browser";

export interface MarketDataRequest {
    symbol: string;
    timeframe: string;
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

export type BrowserCapture = (request: MarketDataRequest) => Promise<MarketDataRecord[]>;
