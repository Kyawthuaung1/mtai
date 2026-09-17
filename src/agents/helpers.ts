import type { FetchLike, MarketDataRequest } from "./types";

export function validateRequest(request: MarketDataRequest): void {
    if (!request.symbol.trim()) throw new Error("symbol is required");
    if (!request.timeframe.trim()) throw new Error("timeframe is required");
}

export function providerSymbol(symbol: string): string {
    return symbol.trim().toUpperCase().replace(/(USDT|USDC|BUSD|FDUSD)$/, "");
}

export async function readJson(response: Response, provider: string): Promise<unknown> {
    if (!response.ok) throw new Error(`${provider} request failed with HTTP ${response.status}`);
    return response.json();
}

export function defaultFetcher(): FetchLike {
    return fetch;
}

