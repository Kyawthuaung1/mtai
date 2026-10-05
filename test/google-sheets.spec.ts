import { describe, expect, it } from "vitest";
import {
  GoogleSheetsMarketDataStore,
  type GoogleSheetsClient,
} from "../src/market-data/google-sheets";
import type { MarketDataRecord } from "../src/agents/types";

class FakeSheets implements GoogleSheetsClient {
  rows: string[][] = [];

  async appendRows(values: string[][]): Promise<void> {
    this.rows = values;
  }

  async readRows(): Promise<string[][]> {
    return this.rows;
  }
}

const record = (price: number, timestamp: string): MarketDataRecord => ({
  source: "binance",
  symbol: "btcusdt",
  timeframe: "1H",
  timestamp,
  data: { price },
});

describe("Google Sheets market data store", () => {
  it("writes and reads normalized records", async () => {
    const sheets = new FakeSheets();
    const store = new GoogleSheetsMarketDataStore(sheets);

    await store.save([record(100, "2024-01-01T00:00:00Z")]);

    expect(await store.all()).toEqual([
      {
        source: "binance",
        symbol: "BTCUSDT",
        timeframe: "1h",
        timestamp: "2024-01-01T00:00:00.000Z",
        data: { price: 100 },
      },
    ]);
  });

  it("keeps one row for the same deterministic record identity", async () => {
    const sheets = new FakeSheets();
    const store = new GoogleSheetsMarketDataStore(sheets);

    await store.upsert([
      record(100, "2024-01-01T00:00:00Z"),
      record(101, "2024-01-01T00:00:00.000Z"),
    ]);

    const rows = await store.all();

    expect(rows).toHaveLength(1);
    expect(rows[0]?.data).toEqual({ price: 101 });
  });

  it("supports the standard MarketDataQuery filters", async () => {
    const sheets = new FakeSheets();
    const store = new GoogleSheetsMarketDataStore(sheets);

    await store.save([
      record(100, "2024-01-01T00:00:00Z"),
      record(101, "2024-01-01T01:00:00Z"),
    ]);

    const result = await store.query({
      symbol: "BTCUSDT",
      timeframe: "1h",
      from: "2024-01-01T00:30:00Z",
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.data).toEqual({ price: 101 });
  });
});
