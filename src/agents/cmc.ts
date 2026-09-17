import { defaultFetcher, providerSymbol, readJson, validateRequest } from "./helpers";
import type { CmcAgentConfig, FetchLike, MarketDataAgent, MarketDataRecord } from "./types";

interface CmcResponse {
    data?: Record<string, unknown>;
    status?: Record<string, unknown>;
}

export class CmcMarketDataAgent implements MarketDataAgent {
    readonly name = "cmc" as const;
    private readonly apiKey: string;
    private readonly baseUrl: string;
    private readonly fetcher: FetchLike;

    constructor(config: CmcAgentConfig) {
        if (!config.apiKey.trim()) throw new Error("CoinMarketCap API key is required");
        this.apiKey = config.apiKey;
        this.baseUrl = config.baseUrl ?? "https://pro-api.coinmarketcap.com";
        this.fetcher = config.fetcher ?? defaultFetcher();
    }

    async collect(request: Parameters<MarketDataAgent["collect"]>[0]): Promise<MarketDataRecord[]> {
        validateRequest(request);
        const symbol = providerSymbol(request.symbol);
        const url = new URL("/v2/cryptocurrency/quotes/latest", this.baseUrl);
        url.searchParams.set("symbol", symbol);
        const response = await this.fetcher(url, {
            headers: { "X-CMC_PRO_API_KEY": this.apiKey, accept: "application/json" },
        });
        const payload = (await readJson(response, "CoinMarketCap")) as CmcResponse;
        return [{
            source: this.name,
            symbol: request.symbol.trim().toUpperCase(),
            timeframe: request.timeframe.trim(),
            timestamp: new Date().toISOString(),
            data: { quote: payload.data ?? {}, status: payload.status ?? {} },
        }];
    }
}
