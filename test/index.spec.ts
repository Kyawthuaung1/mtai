import { describe, expect, it } from "vitest";
import worker from "../src/index";

function post(body: string): Request {
    return new Request("https://example.com", { method: "POST", body });
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
