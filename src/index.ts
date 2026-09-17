export interface InputRequest {
    symbol: string;
    timeframe?: string;
}

export interface NormalizedInput {
    symbol: string;
    timeframe: string;
}

export interface InputAgentResponse {
    ok: boolean;
    agent?: "input";
    input?: NormalizedInput;
    error?: string;
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

    const symbol = body.symbol.trim().toUpperCase();
    const timeframe = body.timeframe === undefined ? "1h" : body.timeframe.trim();

    if (!timeframe) {
        return "timeframe must not be empty";
    }

    return { symbol, timeframe };
}

export default {
    async fetch(request: Request): Promise<Response> {
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

        return json({ ok: true, agent: "input", input: normalized });
     },
} satisfies ExportedHandler<Env>
