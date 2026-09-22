import { describe, expect, it } from "vitest";
import { MarketDataOrchestrator } from "../src/market-data/orchestrator";
import { InMemoryMarketDataStore } from "../src/market-data/persistence";

describe("Market data orchestration", () => {
    it("returns normalized records from the requested provider", async () => {
        const store = new InMemoryMarketDataStore();
        const orchestrator = new MarketDataOrchestrator({
            store,
            fetcher: async () =>
                new Response(
                    JSON.stringify({
                        symbol: "BTCUSDT",
                        interval: "1h",
                        close: 64000,
                    }),
                    { status: 200 },
                ),
        });

        const result = await orchestrator.run({
            symbol: "btcusdt",
            timeframe: "1h",
            providers: ["binance"],
        });

        expect(result.ok).toBe(true);
        expect(result.errors).toHaveLength(0);
        expect(result.records).toHaveLength(1);
        expect(result.records[0]).toMatchObject({
            source: "binance",
            symbol: "BTCUSDT",
            timeframe: "1h",
        });
        expect((await store.all()).length).toBe(1);
    });

    it("returns a stable error for unsupported providers", async () => {
        const result = await new MarketDataOrchestrator().run({
            symbol: "BTCUSDT",
            timeframe: "1h",
            providers: ["mystery"],
        });

        expect(result.ok).toBe(false);
        expect(result.errors).toEqual([
            {
                provider: "mystery",
                error: "Unsupported provider: mystery",
            },
        ]);
    });

    it("drops invalid records before persistence", async () => {
        const store = new InMemoryMarketDataStore();
        const orchestrator = new MarketDataOrchestrator({
            store,
            browserCapture: async () => [{
                source: "browser",
                symbol: "",
                timeframe: "1h",
                timestamp: "invalid-date",
                data: { price: 1 },
            }],
        });

        const result = await orchestrator.run({
            symbol: "ETHUSD",
            timeframe: "1h",
            providers: ["browser"],
        });

        expect(result.ok).toBe(false);
        expect(result.records).toHaveLength(0);
        expect(result.errors[0]?.error).toBe("Invalid market data record");
        expect(await store.all()).toEqual([]);
    });
});
