import { describe, expect, it, vi } from "vitest";
import { BinanceMarketDataAgent } from "../src/agents/binance";
import { BrowserMarketDataAgent } from "../src/agents/browser";
import { MarketDataOrchestrator } from "../src/market-data/orchestrator";
import { InMemoryMarketDataStore } from "../src/market-data/persistence";

const timestamp = "2024-01-01T00:00:00.000Z";
const validRecord = (source: "browser" | "binance" | "cmc") => ({ source, symbol: "BTCUSDT", timeframe: "1h", timestamp, data: { price: 1 } });

const binanceFixture = [[1704067200000, "10", "12", "9", "11", "5"]];

describe("Phase 3 market data pipeline", () => {
    it("normalizes a mocked Binance response without a live network call", async () => {
        const fetcher = vi.fn(async () => new Response(JSON.stringify(binanceFixture), { status: 200 }));
        const binance = await new BinanceMarketDataAgent({ fetcher }).collect({ symbol: "btcusdt", timeframe: "1h" });
        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(binance[0]).toMatchObject({ source: "binance", symbol: "BTCUSDT", timeframe: "1h" });
    });

    it("selects the requested provider, normalizes the request, and persists valid records", async () => {
        const store = new InMemoryMarketDataStore();
        const fetcher = vi.fn(async () => new Response(JSON.stringify(binanceFixture), { status: 200 }));
        const result = await new MarketDataOrchestrator({ store, fetcher }).run({ symbol: " btcusdt ", timeframe: " 1h ", providers: ["BINANCE"] });
        expect(result.request).toEqual({ symbol: "BTCUSDT", timeframe: "1h", providers: ["binance"] });
        expect(result.ok).toBe(true);
        expect(result.records).toHaveLength(1);
        expect(result.records[0]?.source).toBe("binance");
        expect(await store.all()).toEqual(result.records);
    });

    it("isolates provider failures and persists records from a successful provider", async () => {
        const store = new InMemoryMarketDataStore();
        const result = await new MarketDataOrchestrator({
            store,
            browserCapture: async () => [validRecord("browser")],
            fetcher: async () => new Response("failure", { status: 500 }),
        }).run({ symbol: "btcusdt", timeframe: "1h", providers: ["browser", "binance"] });
        expect(result.ok).toBe(false);
        expect(result.records).toEqual([validRecord("browser")]);
        expect(result.errors).toEqual([{ provider: "binance", error: "Binance request failed with HTTP 500" }]);
        expect(await store.all()).toEqual([validRecord("browser")]);
    });

    it("returns stable unsupported-provider errors", async () => {
        const result = await new MarketDataOrchestrator().run({ symbol: "BTCUSDT", timeframe: "1h", providers: ["unknown"] });
        expect(result.errors).toEqual([{ provider: "unknown", error: "Unsupported provider: unknown" }]);
    });

    it("rejects invalid records and never persists them", async () => {
        const store = new InMemoryMarketDataStore();
        const result = await new MarketDataOrchestrator({
            store,
            browserCapture: async () => [{ ...validRecord("browser"), symbol: "", timestamp: "bad" }],
        }).run({ symbol: "BTCUSDT", timeframe: "1h", providers: ["browser"] });
        expect(result.records).toEqual([]);
        expect(result.errors).toEqual([{ provider: "browser", error: "Invalid market data record" }]);
        expect(await store.all()).toEqual([]);
    });

    it("reports persistence failures without discarding collected records", async () => {
        const record = validRecord("browser");
        const result = await new MarketDataOrchestrator({
            store: {
                save: async () => {},
                upsert: async () => { throw new Error("storage unavailable"); },
                query: async () => [],
                all: async () => [],
            },
            browserCapture: async () => [record],
        }).run({ symbol: "BTCUSDT", timeframe: "1h", providers: ["browser"] });
        expect(result.records).toEqual([record]);
        expect(result.errors).toEqual([{ provider: "persistence", error: "storage unavailable" }]);
        expect(result.ok).toBe(false);
    });

    it("uses the browser capture adapter without fabricating market data", async () => {
        const record = validRecord("browser");
        const result = await new BrowserMarketDataAgent(async () => [record]).collect({ symbol: "BTCUSDT", timeframe: "1h" });
        expect(result).toEqual([record]);
    });
});
