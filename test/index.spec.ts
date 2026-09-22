import { describe, expect, it } from "vitest";
import worker from "../src/index";

describe("Input Agent HTTP contract", () => {
    it("requires POST", async () => {
        const response = await worker.fetch(new Request("https://example.com"), {});
        expect(response.status).toBe(405);
        expect(await response.json()).toEqual({ ok: false, error: "POST request required" });
    });

    it("validates symbol and invalid JSON", async () => {
        const invalidJson = await worker.fetch(new Request("https://example.com", { method: "POST", body: "{" }), {});
        expect(invalidJson.status).toBe(400);
        const missingSymbol = await worker.fetch(new Request("https://example.com", { method: "POST", body: "{}" }), {});
        expect(await missingSymbol.json()).toEqual({ ok: false, error: "symbol is required" });
    });
});
