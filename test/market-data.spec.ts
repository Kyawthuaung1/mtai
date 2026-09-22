import { describe, expect, it } from "vitest";
import { BinanceMarketDataAgent } from "../src/agents/binance";
import { CmcMarketDataAgent } from "../src/agents/cmc";
import { BrowserMarketDataAgent } from "../src/agents/browser";
import { MarketDataOrchestrator } from "../src/market-data/orchestrator";
import { InMemoryMarketDataStore } from "../src/market-data/persistence";

const validRecord = (source: "browser" | "binance" | "cmc") => ({ source, symbol: "BTCUSDT", timeframe: "1h", timestamp: new Date().toISOString(), data: { price: 1 } });

describe("Phase 3 market data pipeline", () => {
    it("normalizes Binance and CMC mocked responses", async () => {
        const fetcher = async () => new Response(JSON.stringify({ data: {}, status: {}, close: 1 }), { status: 200 });
        const binance = await new BinanceMarketDataAgent({ fetcher }).collect({ symbol: "btcusdt", timeframe: "1h" });
        const cmc = await new CmcMarketDataAgent({ apiKey: "test-only", fetcher }).collect({ symbol: "btcusdt", timeframe: "1h" });
        expect(binance[0]?.source).toBe("binance");
        expect(cmc[0]?.source).toBe("cmc");
    });

    it("runs providers in parallel and isolates provider failures", async () => {
        const store = new InMemoryMarketDataStore();
        const result = await new MarketDataOrchestrator({
            store,
            browserCapture: async () => [validRecord("browser")],
            fetcher: async () => new Response("failure", { status: 500 }),
        }).run({ symbol: "btcusdt", timeframe: "1h", providers: ["browser", "binance"] });
        expect(result.ok).toBe(false);
        expect(result.records).toHaveLength(1);
        expect(result.errors[0]).toMatchObject({ provider: "binance" });
        expect(await store.all()).toHaveLength(1);
    });

    it("returns stable unsupported-provider errors", async () => {
        const result = await new MarketDataOrchestrator().run({ symbol: "BTCUSDT", timeframe: "1h", providers: ["unknown"] });
        expect(result.errors).toEqual([{ provider: "unknown", error: "Unsupported provider: unknown" }]);
    });

    it("rejects invalid records and never persists them", async () => {
        const store = new InMemoryMarketDataStore();
        const result = await new MarketDataOrchestrator({ store, browserCapture: async () => [{ ...validRecord("browser"), symbol: "", timestamp: "bad" }] }).run({ symbol: "BTCUSDT", timeframe: "1h", providers: ["browser"] });
        expect(result.records).toEqual([]);
        expect(result.errors[0]?.error).toBe("Invalid market data record");
        expect(await store.all()).toEqual([]);
    });

    it("uses the browser capture adapter without fabricating data", async () => {
        const record = validRecord("browser");
        const result = await new BrowserMarketDataAgent(async () => [record]).collect({ symbol: "BTCUSDT", timeframe: "1h" });
        expect(result).toEqual([record]);
    });
});
