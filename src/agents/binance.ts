import { defaultFetcher, readJson, validateRequest } from "./helpers";
import type { BinanceAgentConfig, FetchLike, MarketDataAgent, MarketDataRecord } from "./types";

export class BinanceMarketDataAgent implements MarketDataAgent {
    readonly name = "binance" as const;
    private readonly baseUrl: string;
    private readonly fetcher: FetchLike;

    constructor(config: BinanceAgentConfig = {}) {
        this.baseUrl = config.baseUrl ?? "https://api.binance.com";
        this.fetcher = config.fetcher ?? defaultFetcher();
    }

    async collect(request: Parameters<MarketDataAgent["collect"]>[0]): Promise<MarketDataRecord[]> {
        validateRequest(request);
        const url = new URL("/api/v3/klines", this.baseUrl);
        url.searchParams.set("symbol", request.symbol.trim().toUpperCase());
        url.searchParams.set("interval", request.timeframe.trim());
        url.searchParams.set("limit", "1");
        const response = await this.fetcher(url);
        const klines = await readJson(response, "Binance");
        return [{
            source: this.name,
            symbol: request.symbol.trim().toUpperCase(),
            timeframe: request.timeframe.trim(),
            timestamp: new Date().toISOString(),
            data: { klines },
        }];
    }
}
