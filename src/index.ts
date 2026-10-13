import { analyzeMarketData } from "./analysis";
import { executeMarketDataRequest } from "./market-data/orchestrator";
import { CloudflareKVMarketDataStore } from "./market-data/persistence";

export interface InputRequest {
    symbol: string;
    timeframe?: string;
    providers?: string[];
    mode?: "market-data" | "analysis";
    from?: string;
    to?: string;
}

export interface NormalizedInput {
    symbol: string;
    timeframe: string;
    providers: string[];
}

export interface Env {
    MARKET_DATA_CMC_API_KEY?: string;
    MARKET_DATA_STORE?: KVNamespace;
}

interface ResponseBody {
    ok: boolean;
    agent?: "input" | "analysis";
    input?: NormalizedInput | { symbol: string; timeframe: string; from?: string; to?: string };
    request?: { symbol: string; timeframe: string; providers: string[] };
    records?: unknown[];
    errors?: Array<{ provider: string; error: string }>;
    analysis?: unknown;
    error?: string;
}

function json(body: ResponseBody, init?: ResponseInit): Response {
    return Response.json(body, { headers: { "content-type": "application/json; charset=UTF-8" }, ...init });
}

function normalizeInput(body: Partial<InputRequest>): NormalizedInput | string {
    if (typeof body.symbol !== "string" || !body.symbol.trim()) return "symbol is required";
    if (body.timeframe !== undefined && typeof body.timeframe !== "string") return "timeframe must be a string";
    if (body.providers !== undefined && (!Array.isArray(body.providers) || body.providers.some((provider) => typeof provider !== "string" || !provider.trim()))) return "providers must be an array of non-empty strings";
    const timeframe = body.timeframe === undefined ? "1h" : body.timeframe.trim();
    if (!timeframe) return "timeframe must not be empty";
    return { symbol: body.symbol.trim().toUpperCase(), timeframe: timeframe.toLowerCase(), providers: body.providers?.map((provider) => provider.trim().toLowerCase()) ?? ["binance"] };
}

function normalizeDateRange(body: Partial<InputRequest>): { from?: string; to?: string } | string {
    if (body.from !== undefined && typeof body.from !== "string") return "from must be an ISO date string";
    if (body.to !== undefined && typeof body.to !== "string") return "to must be an ISO date string";

    const from = body.from === undefined ? undefined : Date.parse(body.from);
    const to = body.to === undefined ? undefined : Date.parse(body.to);
    if (from !== undefined && !Number.isFinite(from)) return "from must be a valid date";
    if (to !== undefined && !Number.isFinite(to)) return "to must be a valid date";
    if (from !== undefined && to !== undefined && from > to) return "from must be before or equal to to";

    return {
        ...(from === undefined ? {} : { from: new Date(from).toISOString() }),
        ...(to === undefined ? {} : { to: new Date(to).toISOString() }),
    };
}

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        if (request.method !== "POST") return json({ ok: false, error: "POST request required" }, { status: 405 });

        let body: unknown;
        try { body = await request.json(); } catch { return json({ ok: false, error: "Invalid JSON" }, { status: 400 }); }
        if (!body || typeof body !== "object" || Array.isArray(body)) return json({ ok: false, error: "JSON object required" }, { status: 400 });

        const payload = body as Partial<InputRequest>;
        const mode = payload.mode ?? "market-data";
        if (mode !== "market-data" && mode !== "analysis") {
            return json({ ok: false, error: "mode must be 'market-data' or 'analysis'" }, { status: 400 });
        }

        const input = normalizeInput(payload);
        if (typeof input === "string") return json({ ok: false, error: input }, { status: 400 });

        if (mode === "analysis") {
            const range = normalizeDateRange(payload);
            if (typeof range === "string") return json({ ok: false, error: range }, { status: 400 });
            if (!env.MARKET_DATA_STORE) {
                return json({ ok: false, error: "Analysis requires the MARKET_DATA_STORE KV binding" }, { status: 503 });
            }

            try {
                const store = new CloudflareKVMarketDataStore(env.MARKET_DATA_STORE);
                const records = await store.query({ symbol: input.symbol, timeframe: input.timeframe, ...range });
                const analysis = analyzeMarketData({ symbol: input.symbol, timeframe: input.timeframe, records });
                return json({
                    ok: analysis.ok,
                    agent: "analysis",
                    input: { symbol: input.symbol, timeframe: input.timeframe, ...range },
                    analysis,
                }, analysis.ok ? undefined : { status: 422 });
            } catch {
                return json({ ok: false, error: "Unable to read stored market data for analysis" }, { status: 500 });
            }
        }

        const result = await executeMarketDataRequest({ ...input }, {
            cmcApiKey: env.MARKET_DATA_CMC_API_KEY,
            store: env.MARKET_DATA_STORE ? new CloudflareKVMarketDataStore(env.MARKET_DATA_STORE) : undefined,
        });
        return json({ ok: result.ok, agent: "input", input, request: result.request, records: result.records, errors: result.errors }, result.ok ? undefined : { status: 207 });
    },
} satisfies ExportedHandler<Env>;
