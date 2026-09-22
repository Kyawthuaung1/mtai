import type { BrowserCapture, MarketDataAgent, MarketDataRecord, MarketDataRequest } from "./types";

export class BrowserMarketDataAgent implements MarketDataAgent {
    readonly name = "browser" as const;

    constructor(private readonly capture: BrowserCapture = async () => []) {}

    collect(request: MarketDataRequest): Promise<MarketDataRecord[]> {
        return this.capture(request);
    }
}
