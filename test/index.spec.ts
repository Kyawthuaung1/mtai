import { describe, expect, it } from "vitest";
import worker from "../src/index";
import { CloudflareKVMarketDataStore } from "../src/market-data/persistence";

function post(body: string): Request {
    return new Request("https://example.com", { method: "POST", body });
}

function fakeKV(): KVNamespace {
    const entries = new Map<string, string>();
    const binding = {
        put: async (key: string, value: string) => { entries.set(key, value); },
        get: async (key: string, type?: string) => {
            const value = entries.get(key);
            if (value === undefined) return null;
            return type === "json" ? JSON.parse(value) : value;
        },
        list: async (options: { prefix?: string } = {}) => ({
            keys: [...entries.keys()]
                .filter((key) => key.startsWith(options.prefix ?? ""))
                .map((name) => ({ name, expiration: undefined, metadata: undefined })),
            list_complete: true,
        }),
        delete: async (key: string) => { entries.delete(key); },
    };
    return binding as unknown as KVNamespace;
}

describe("Input Agent HTTP contract", () => {
    it("requires POST", async () => {
        const response = await worker.fetch(new Request("https://example.com"), {});
        expect(response.status).toBe(405);
        expect(await response.json()).toEqual({ ok: false, error: "POST request required" });
    });

    it("validates malformed JSON, JSON shape, and required symbol", async () => {
        const invalidJson = await worker.fetch(post("{"), {});
        expect(invalidJson.status).toBe(400);
        expect(await invalidJson.json()).toEqual({ ok: false, error: "Invalid JSON" });
        const arrayBody = await worker.fetch(post("[]"), {});
        expect(arrayBody.status).toBe(400);
        expect(await arrayBody.json()).toEqual({ ok: false, error: "JSON object required" });
        const missingSymbol = await worker.fetch(post("{}"), {});
        expect(missingSymbol.status).toBe(400);
        expect(await missingSymbol.json()).toEqual({ ok: false, error: "symbol is required" });
    });

    it("rejects invalid timeframe and provider input", async () => {
        const invalidTimeframe = await worker.fetch(post(JSON.stringify({ symbol: "BTCUSDT", timeframe: 2 })), {});
        expect(await invalidTimeframe.json()).toEqual({ ok: false, error: "timeframe must be a string" });
        const invalidProviders = await worker.fetch(post(JSON.stringify({ symbol: "BTCUSDT", providers: [" "] })), {});
        expect(await invalidProviders.json()).toEqual({ ok: false, error: "providers must be an array of non-empty strings" });
    });

    it("normalizes symbols and preserves the default timeframe and response contract", async () => {
        const response = await worker.fetch(post(JSON.stringify({ symbol: " btcusdt ", providers: ["unsupported"] })), {});
        expect(response.status).toBe(207);
        expect(await response.json()).toEqual({
            ok: false,
            agent: "input",
            input: { symbol: "BTCUSDT", timeframe: "1h", providers: ["unsupported"] },
            request: { symbol: "BTCUSDT", timeframe: "1h", providers: ["unsupported"] },
            records: [],
            errors: [{ provider: "unsupported", error: "Unsupported provider: unsupported" }],
        });
    });
});

describe("Analysis Agent HTTP contract", () => {
    it("requires persistent KV storage instead of silently analyzing an empty in-memory store", async () => {
        const response = await worker.fetch(post(JSON.stringify({ mode: "analysis", symbol: "BTCUSDT" })), {});
        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({ ok: false, error: "Analysis requires the MARKET_DATA_STORE KV binding" });
    });

    it("validates mode and date ranges", async () => {
        const invalidMode = await worker.fetch(post(JSON.stringify({ mode: "other", symbol: "BTCUSDT" })), {});
        expect(invalidMode.status).toBe(400);
        const invalidDate = await worker.fetch(post(JSON.stringify({ mode: "analysis", symbol: "BTCUSDT", from: "not-a-date" })), { MARKET_DATA_STORE: fakeKV() });
        expect(invalidDate.status).toBe(400);
        const reversedRange = await worker.fetch(post(JSON.stringify({ mode: "analysis", symbol: "BTCUSDT", from: "2024-02-01", to: "2024-01-01" })), { MARKET_DATA_STORE: fakeKV() });
        expect(reversedRange.status).toBe(400);
    });

    it("queries persisted records and returns the deterministic analysis result", async () => {
        const kv = fakeKV();
        const store = new CloudflareKVMarketDataStore(kv);
        const records = Array.from({ length: 20 }, (_, index) => {
            const close = 100 + index;
            return {
                source: "binance" as const,
                symbol: "BTCUSDT",
                timeframe: "1h",
                timestamp: new Date(Date.UTC(2024, 0, 1, index)).toISOString(),
                data: { open: close, high: close + 1, low: close - 1, close, volume: 10 },
            };
        });
        await store.upsert(records);
        await store.upsert([{
            source: "binance",
            symbol: "ETHUSDT",
            timeframe: "1h",
            timestamp: "2024-01-01T00:00:00.000Z",
            data: { close: 200 },
        }]);

        const response = await worker.fetch(post(JSON.stringify({ mode: "analysis", symbol: "btcusdt", timeframe: "1H" })), { MARKET_DATA_STORE: kv });
        expect(response.status).toBe(200);
        const body = await response.json() as { ok: boolean; agent: string; analysis: { symbol: string; timeframe: string; statistics: { latestPrice?: number }; dataQuality: { validRecords: number } } };
        expect(body.ok).toBe(true);
        expect(body.agent).toBe("analysis");
        expect(body.analysis).toMatchObject({
            symbol: "BTCUSDT",
            timeframe: "1h",
            statistics: { latestPrice: 119 },
            dataQuality: { validRecords: 20 },
        });
    });

    it("returns an explicit data-quality status when the selected range contains no records", async () => {
        const response = await worker.fetch(post(JSON.stringify({ mode: "analysis", symbol: "BTCUSDT" })), { MARKET_DATA_STORE: fakeKV() });
        expect(response.status).toBe(422);
        const body = await response.json() as { ok: boolean; analysis: { dataQuality: { status: string; issues: string[] } } };
        expect(body.ok).toBe(false);
        expect(body.analysis.dataQuality.status).toBe("invalid");
        expect(body.analysis.dataQuality.issues).toContain("market data is empty");
    });
});
