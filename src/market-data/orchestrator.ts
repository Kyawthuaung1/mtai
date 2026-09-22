import { BinanceMarketDataAgent } from "../agents/binance";
import { CmcMarketDataAgent } from "../agents/cmc";
import type { BrowserCapture, FetchLike, MarketDataAgent, MarketDataError, MarketDataRecord, MarketDataRequest, MarketDataResponse, MarketDataStore, MarketProviderName } from "../agents/types";
import { BrowserMarketDataAgent } from "../agents/browser";
import { InMemoryMarketDataStore } from "./persistence";

export interface MarketDataOrchestratorConfig {
    cmcApiKey?: string;
    fetcher?: FetchLike;
    browserCapture?: BrowserCapture;
    store?: MarketDataStore;
}

export function normalizeProviderNames(providers?: string[]): string[] {
    return (providers && providers.length > 0 ? providers : ["binance"])
        .map((provider) => provider.trim().toLowerCase())
        .filter((provider, index, values) => values.indexOf(provider) === index);
}

export function validateMarketDataRecord(record: unknown): record is MarketDataRecord {
    if (!record || typeof record !== "object") return false;
    const candidate = record as Partial<MarketDataRecord>;
    return typeof candidate.source === "string"
        && ["cmc", "binance", "browser"].includes(candidate.source)
        && typeof candidate.symbol === "string"
        && candidate.symbol.trim().length > 0
        && typeof candidate.timeframe === "string"
        && candidate.timeframe.trim().length > 0
        && typeof candidate.timestamp === "string"
        && !Number.isNaN(Date.parse(candidate.timestamp))
        && typeof candidate.data === "object"
        && candidate.data !== null
        && !Array.isArray(candidate.data);
}

export class MarketDataOrchestrator {
    private readonly store: MarketDataStore;

    constructor(private readonly config: MarketDataOrchestratorConfig = {}) {
        this.store = config.store ?? new InMemoryMarketDataStore();
    }

    private createAgent(provider: MarketProviderName): MarketDataAgent {
        switch (provider) {
            case "cmc":
                if (!this.config.cmcApiKey?.trim()) throw new Error("CMC API key is required for provider 'cmc'");
                return new CmcMarketDataAgent({ apiKey: this.config.cmcApiKey, fetcher: this.config.fetcher });
            case "binance":
                return new BinanceMarketDataAgent({ fetcher: this.config.fetcher });
            case "browser":
                return new BrowserMarketDataAgent(this.config.browserCapture);
        }
    }

    async run(request: MarketDataRequest): Promise<MarketDataResponse> {
        const normalizedRequest = {
            symbol: request.symbol.trim().toUpperCase(),
            timeframe: request.timeframe.trim(),
            providers: normalizeProviderNames(request.providers),
        };
        const records: MarketDataRecord[] = [];
        const errors: MarketDataError[] = [];

        const results = await Promise.all(normalizedRequest.providers.map(async (provider) => {
            try {
                if (!["cmc", "binance", "browser"].includes(provider)) {
                    throw new Error(`Unsupported provider: ${provider}`);
                }
                const collected = await this.createAgent(provider as MarketProviderName).collect({
                    symbol: normalizedRequest.symbol,
                    timeframe: normalizedRequest.timeframe,
                });
                return { provider, records: collected };
            } catch (error) {
                return { provider, error: error instanceof Error ? error.message : "Unknown provider error" };
            }
        }));

        for (const result of results) {
            if ("error" in result) {
                errors.push({ provider: result.provider, error: result.error });
                continue;
            }
            for (const record of result.records) {
                if (validateMarketDataRecord(record)) records.push(record);
                else errors.push({ provider: result.provider, error: "Invalid market data record" });
            }
        }

        if (records.length > 0) {
            try {
                await this.store.save(records);
            } catch (error) {
                errors.push({ provider: "persistence", error: error instanceof Error ? error.message : "Persistence failed" });
            }
        }

        return {
            ok: errors.length === 0,
            request: { symbol: normalizedRequest.symbol, timeframe: normalizedRequest.timeframe, providers: normalizedRequest.providers },
            records,
            errors,
        };
    }
}

export function executeMarketDataRequest(request: MarketDataRequest, config: MarketDataOrchestratorConfig = {}): Promise<MarketDataResponse> {
    return new MarketDataOrchestrator(config).run(request);
}
