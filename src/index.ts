import { executeMarketDataRequest } from "./market-data/orchestrator";
import { CloudflareKVMarketDataStore } from "./market-data/persistence";

export interface InputRequest {
    symbol: string;
    timeframe?: string;
    providers?: string[];
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
    agent?: "input";
    input?: NormalizedInput;
    request?: { symbol: string; timeframe: string; providers: string[] };
    records?: unknown[];
    errors?: Array<{ provider: string; error: string }>;
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
    return { symbol: body.symbol.trim().toUpperCase(), timeframe, providers: body.providers?.map((provider) => provider.trim().toLowerCase()) ?? ["binance"] };
}

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        if (request.method !== "POST") return json({ ok: false, error: "POST request required" }, { status: 405 });
        let body: unknown;
        try { body = await request.json(); } catch { return json({ ok: false, error: "Invalid JSON" }, { status: 400 }); }
        if (!body || typeof body !== "object" || Array.isArray(body)) return json({ ok: false, error: "JSON object required" }, { status: 400 });
        const input = normalizeInput(body as Partial<InputRequest>);
        if (typeof input === "string") return json({ ok: false, error: input }, { status: 400 });

        const result = await executeMarketDataRequest({ ...input }, {
            cmcApiKey: env.MARKET_DATA_CMC_API_KEY,
            store: env.MARKET_DATA_STORE ? new CloudflareKVMarketDataStore(env.MARKET_DATA_STORE) : undefined,
        });
        return json({ ok: result.ok, agent: "input", input, request: result.request, records: result.records, errors: result.errors }, result.ok ? undefined : { status: 207 });
    },
} satisfies ExportedHandler<Env>;
