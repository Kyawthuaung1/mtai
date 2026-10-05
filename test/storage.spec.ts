import { describe, expect, it } from "vitest";
import {
    InMemoryMarketDataStore,
    marketDataId,
} from "../src/market-data/persistence";
import type { MarketDataRecord } from "../src/agents/types";

const record = (timestamp: string, price: number): MarketDataRecord => ({
    source: "binance",
    symbol: "btcusdt",
    timeframe: "1H",
    timestamp,
    data: { price },
});

describe("Phase 5 market data storage", () => {
    it("creates deterministic identity from source, symbol, timeframe and timestamp", () => {
        expect(marketDataId(record("2024-01-01T00:00:00Z", 100)))
            .toBe(marketDataId(record("2024-01-01T00:00:00.000Z", 200)));
    });

    it("normalizes records and performs idempotent upserts", async () => {
        const store = new InMemoryMarketDataStore();

        await store.upsert([
            record("2024-01-01T00:00:00Z", 100),
            record("2024-01-01T00:00:00.000Z", 101),
        ]);

        const all = await store.all();

        expect(all).toHaveLength(1);
        expect(all[0]).toMatchObject({
            source: "binance",
            symbol: "BTCUSDT",
            timeframe: "1h",
            data: { price: 101 },
        });
    });

    it("filters by source, symbol, timeframe and time range", async () => {
        const store = new InMemoryMarketDataStore();

        await store.save([
            record("2024-01-01T00:00:00Z", 100),
            record("2024-01-01T01:00:00Z", 101),
            {
                ...record("2024-01-01T02:00:00Z", 102),
                symbol: "ETHUSDT",
            },
        ]);

        const result = await store.query({
            source: "BINANCE",
            symbol: "btcusdt",
            timeframe: "1h",
            from: "2024-01-01T00:30:00Z",
            to: "2024-01-01T01:30:00Z",
        });

        expect(result).toHaveLength(1);
        expect(result[0]?.data).toEqual({ price: 101 });
    });

    it("returns an empty result for unmatched filters", async () => {
        const store = new InMemoryMarketDataStore();

        await store.save([record("2024-01-01T00:00:00Z", 100)]);

        expect(await store.query({ symbol: "SOLUSDT" })).toEqual([]);
    });
});
