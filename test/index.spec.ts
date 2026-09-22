import { executeMarketDataRequest } from "./market-data/orchestrator";

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

export interface InputAgentResponse {
    ok: boolean;
    agent?: "input";
    input?: NormalizedInput;
    request?: {
        symbol: string;
        timeframe: string;
        providers: string[];
    };
    records?: unknown[];
    errors?: Array<{ provider: string; error: string }>;
    error?: string;
}

export interface Env {
    MARKET_DATA_CMC_API_KEY?: string;
}

function json(body: InputAgentResponse, init?: ResponseInit): Response {
    return Response.json(body, {
        headers: { "content-type": "application/json; charset=UTF-8" },
        ...init,
    });
}

function normalizeInput(body: Partial<InputRequest>): NormalizedInput | string {
    if (typeof body.symbol !== "string" || !body.symbol.trim()) {
        return "symbol is required";
    }

    if (body.timeframe !== undefined && typeof body.timeframe !== "string") {
        return "timeframe must be a string";
    }

    if (body.providers !== undefined && !Array.isArray(body.providers)) {
        return "providers must be an array of strings";
    }

    const symbol = body.symbol.trim().toUpperCase();
    const timeframe = body.timeframe === undefined ? "1h" : body.timeframe.trim();

    if (!timeframe) {
        return "timeframe must not be empty";
    }

    if (Array.isArray(body.providers)) {
        for (const provider of body.providers) {
            if (typeof provider !== "string" || !provider.trim()) {
                return "provider names must be non-empty strings";
            }
        }
    }

    return {
        symbol,
        timeframe,
        providers: body.providers?.map((provider) => provider.trim().toLowerCase()) ?? ["binance"],
    };
}

export default {
    async fetch(request: Request, env?: Env): Promise<Response> {
        if (request.method !== "POST") {
            return json({ ok: false, error: "POST request required" }, { status: 405 });
        }

        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return json({ ok: false, error: "Invalid JSON" }, { status: 400 });
        }

        if (!body || typeof body !== "object" || Array.isArray(body)) {
            return json({ ok: false, error: "JSON object required" }, { status: 400 });
        }

        const normalized = normalizeInput(body as Partial<InputRequest>);
        if (typeof normalized === "string") {
            return json({ ok: false, error: normalized }, { status: 400 });
        }

        const marketResponse = await executeMarketDataRequest(
            {
                symbol: normalized.symbol,
                timeframe: normalized.timeframe,
                providers: normalized.providers,
            },
            {
                cmcApiKey: env?.MARKET_DATA_CMC_API_KEY,
            },
        );

        return json({
            ok: marketResponse.ok,
            agent: "input",
            input: normalized,
            request: marketResponse.request,
            records: marketResponse.records,
            errors: marketResponse.errors,
        }, marketResponse.ok ? {} : { status: 207 });
    },
} satisfies ExportedHandler<Env>;
