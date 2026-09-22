import type { MarketDataRecord, MarketDataStore } from "../agents/types";

export class InMemoryMarketDataStore implements MarketDataStore {
    private readonly records: MarketDataRecord[] = [];

    async save(records: MarketDataRecord[]): Promise<void> {
        this.records.push(...records);
    }

    async all(): Promise<MarketDataRecord[]> {
        return [...this.records];
    }
}

export interface CloudflareMarketDataBindings {
    MARKET_DATA_STORE?: KVNamespace;
}

export class CloudflareKVMarketDataStore implements MarketDataStore {
    private readonly kv?: KVNamespace;
    private readonly prefix: string;

    constructor(kv?: KVNamespace, prefix = "market-data") {
        this.kv = kv;
        this.prefix = prefix;
    }

    async save(records: MarketDataRecord[]): Promise<void> {
        if (!this.kv) {
            throw new Error("Market data KV binding is not configured");
        }

        for (const record of records) {
            const key = `${this.prefix}:${record.source}:${record.symbol}:${record.timeframe}:${record.timestamp}`;
            await this.kv.put(key, JSON.stringify(record));
        }
    }
}
