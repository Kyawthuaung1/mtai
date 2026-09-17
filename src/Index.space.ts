import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("MTAI Input Agent", () => {
    it("normalizes symbol and applies the default timeframe", async () => {
        const response = await SELF.fetch("https://example.com", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ symbol: "  btcusdt  " }),
        });

        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toContain("application/json");
        expect(await response.json()).toEqual({
            ok: true,
            agent: "input",
            input: { symbol: "BTCUSDT", timeframe: "1h" },
        });
    });

    it("preserves a supplied timeframe while trimming it", async () => {
        const response = await SELF.fetch("https://example.com", {
            method: "POST",
            body: JSON.stringify({ symbol: "ethusdt", timeframe: " 4h " }),
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            ok: true,
            agent: "input",
            input: { symbol: "ETHUSDT", timeframe: "4h" },
        });
    });

    it("rejects non-POST requests", async () => {
        const response = await SELF.fetch("https://example.com");
        expect(response.status).toBe(405);
        expect(await response.json()).toEqual({ ok: false, error: "POST request required" });
    });

    it("rejects invalid JSON", async () => {
        const response = await SELF.fetch("https://example.com", {
            method: "POST",
            body: "not-json",
        });
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ ok: false, error: "Invalid JSON" });
    });

    it("rejects missing or blank symbols", async () => {
        for (const body of [{}, { symbol: "   " }]) {
            const response = await SELF.fetch("https://example.com", {
                method: "POST",
                body: JSON.stringify(body),
            });
            expect(response.status).toBe(400);
            expect(await response.json()).toEqual({ ok: false, error: "symbol is required" });
        }
    });

    it("rejects invalid JSON shapes and timeframe values", async () => {
        for (const body of [[], { symbol: "BTCUSDT", timeframe: 1 }, { symbol: "BTCUSDT", timeframe: "   " }]) {
            const response = await SELF.fetch("https://example.com", {
                method: "POST",
                body: JSON.stringify(body),
            });
            expect(response.status).toBe(400);
        }
    });
});
