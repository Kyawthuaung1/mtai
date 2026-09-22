import type { FetchLike, MarketDataAgent, MarketDataError, MarketDataRecord, MarketDataRequest, MarketDataResponse, MarketDataStore, MarketProviderName } from "../agents/types";
import { CmcMarketDataAgent } from "../agents/cmc";
import { BinanceMarketDataAgent } from "../agents/binance";
import { InMemoryMarketDataStore } from "./persistence";

export type BrowserCapture = (request: MarketDataRequest) => Promise<MarketDataRecord[]>;

export interface MarketDataOrchestratorConfig {
    cmcApiKey?: string;
    fetcher?: FetchLike;
    browserCapture?: BrowserCapture;
    store?: MarketDataStore;
}

export class BrowserMarketDataAgent implements MarketDataAgent {
    readonly name = "browser" as const;
    constructor(private readonly capture: BrowserCapture = async () => []) {}

    async collect(request: MarketDataRequest): Promise<MarketDataRecord[]> {
        return this.capture(request);
    }
}

export function normalizeProviderNames(providers?: string[]): MarketProviderName[] {
    const requested = providers && providers.length > 0 ? providers : ["binance"];
    const normalized: MarketProviderName[] = [];

    for (const provider of requested) {
        const name = provider.trim().toLowerCase();
        if (name === "cmc" || name === "binance" || name === "browser") {
            if (!normalized.includes(name as MarketProviderName)) {
                normalized.push(name as MarketProviderName);
            }
            continue;
        }

        throw new Error(`Unsupported provider: ${provider}`);
    }

    return normalized;
}

export function validateMarketDataRecord(record: unknown): record is MarketDataRecord {
    if (!record || typeof record !== "object") {
        return false;
    }

    const candidate = record as Partial<MarketDataRecord>;
    if (typeof candidate.source !== "string" || !["cmc", "binance", "browser"].includes(candidate.source)) {
        return false;
    }
    if (typeof candidate.symbol !== "string" || !candidate.symbol.trim()) {
        return false;
    }
    if (typeof candidate.timeframe !== "string" || !candidate.timeframe.trim()) {
        return false;
    }
    if (typeof candidate.timestamp !== "string" || Number.isNaN(Date.parse(candidate.timestamp))) {
        return false;
    }
    if (typeof candidate.data !== "object" || candidate.data === null || Array.isArray(candidate.data)) {
        return false;
    }

    return true;
}

export class MarketDataOrchestrator {
    private readonly store: MarketDataStore;
    private readonly cmcApiKey?: string;
    private readonly fetcher?: FetchLike;
    private readonly browserCapture?: BrowserCapture;

    constructor(config: MarketDataOrchestratorConfig = {}) {
        this.store = config.store ?? new InMemoryMarketDataStore();
        this.cmcApiKey = config.cmcApiKey;
        this.fetcher = config.fetcher;
        this.browserCapture = config.browserCapture;
    }

    private createAgent(provider: MarketProviderName): MarketDataAgent {
        switch (provider) {
            case "cmc": {
                if (!this.cmcApiKey || !this.cmcApiKey.trim()) {
                    throw new Error("CMC API key is required for provider 'cmc'");
                }
                return new CmcMarketDataAgent({
                    apiKey: this.cmcApiKey,
                    fetcher: this.fetcher,
                });
            }
            case "binance":
                return new BinanceMarketDataAgent({ fetcher: this.fetcher });
            case "browser":
                return new BrowserMarketDataAgent(this.browserCapture ?? (async () => []));
            default:
                throw new Error(`Unsupported provider: ${provider}`);
        }
    }

    async run(request: MarketDataRequest): Promise<MarketDataResponse> {
        const normalizedRequest: MarketDataRequest = {
            symbol: request.symbol.trim().toUpperCase(),
            timeframe: request.timeframe.trim(),
            providers: normalizeProviderNames(request.providers),
        };

        const providerNames = normalizedRequest.providers ?? normalizeProviderNames();
        const records: MarketDataRecord[] = [];
        const errors: MarketDataError[] = [];

        for (const provider of providerNames) {
            try {
                const agent = this.createAgent(provider);
                const collected = await agent.collect({
                    symbol: normalizedRequest.symbol,
                    timeframe: normalizedRequest.timeframe,
                });

                for (const item of collected) {
                    if (validateMarketDataRecord(item)) {
                        records.push(item);
                        continue;
                    }

                    errors.push({
                        provider,
                        error: "Invalid market data record",
                    });
                }
            } catch (error) {
                errors.push({
                    provider,
                    error: error instanceof Error ? error.message : "Unknown provider error",
                });
            }
        }

        const persistedRecords = records.filter((record) => typeof record.data === "object" && record.data !== null);
        if (persistedRecords.length > 0) {
            await this.store.save(persistedRecords);
        }

        return {
            ok: errors.length === 0,
            request: {
                symbol: normalizedRequest.symbol,
                timeframe: normalizedRequest.timeframe,
                providers: providerNames,
            },
            records,
            errors,
        };
    }
}

export async function executeMarketDataRequest(
    request: MarketDataRequest,
    config: MarketDataOrchestratorConfig = {},
): Promise<MarketDataResponse> {
    return new MarketDataOrchestrator(config).run(request);
}

export const marketDataOrchestrator = new MarketDataOrchestrator();
