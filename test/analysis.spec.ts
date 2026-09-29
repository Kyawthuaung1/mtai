import { describe, expect, it } from "vitest";
import { AnalysisEngine, analyzeMarketData } from "../src/analysis";
import { calculateEMA, calculateRSI, calculateSMA } from "../src/analysis/indicators";

const bars = [
    { timestamp: "2024-01-01T00:00:00.000Z", close: 10 },
    { timestamp: "2024-01-01T01:00:00.000Z", close: 20 },
    { timestamp: "2024-01-01T02:00:00.000Z", close: 30 },
];

function record(timestamp: string, close: number, symbol = "BTCUSDT", timeframe = "1h") {
    return { source: "fixture", symbol, timeframe, timestamp, data: { timestamp, open: close, high: close, low: close, close, volume: 2 } };
}

describe("deterministic indicators", () => {
    it("calculates SMA, EMA, and RSI from finite series", () => {
        expect(calculateSMA([1, 2, 3, 4, 5], 3)).toMatchObject({ status: "ok", value: 4 });
        expect(calculateEMA([1, 2, 3, 4, 5], 3)).toMatchObject({ status: "ok", value: 4.0625 });
        expect(calculateRSI([1, 2, 3, 4, 5], 2)).toMatchObject({ status: "ok", value: 100 });
    });

    it("returns a deterministic insufficient-data result for short periods", () => {
        for (const result of [calculateSMA([1], 2), calculateEMA([1], 2), calculateRSI([1, 2], 2)]) {
            expect(result.status).toBe("insufficient-data");
            expect(result.value).toBeUndefined();
            expect(result.reason).toBeTruthy();
        }
    });

    it("never returns NaN or Infinity", () => {
        for (const result of [
            calculateSMA([Number.MAX_VALUE, Number.MAX_VALUE], 2),
            calculateEMA([-Number.MAX_VALUE, Number.MAX_VALUE], 2),
            calculateRSI([-Number.MAX_VALUE, Number.MAX_VALUE], 1),
        ]) {
            expect(result.value === undefined || Number.isFinite(result.value)).toBe(true);
        }
    });
});

describe("analysis engine", () => {
    it("normalizes symbol and timeframe and returns deterministic statistics and indicators", () => {
        const engine = new AnalysisEngine({ smaPeriod: 2, emaPeriod: 2, rsiPeriod: 2 });
        const result = engine.analyze({
            symbol: " btcusdt ",
            timeframe: " 1H ",
            records: bars.map((bar) => record(bar.timestamp, bar.close, "btcusdt", "1H")),
        });
        expect(result.ok).toBe(true);
        expect(result.symbol).toBe("BTCUSDT");
        expect(result.timeframe).toBe("1h");
        expect(result.dataQuality).toMatchObject({ status: "ok", validRecords: 3, invalidRecords: 0, totalRecords: 3 });
        expect(result.statistics.latestPrice).toBe(30);
        expect(result.statistics.latestTimestamp).toBe("2024-01-01T02:00:00.000Z");
        expect(result.timestamp).toBe("2024-01-01T02:00:00.000Z");
        expect(result.indicators.sma).toMatchObject({ status: "ok", value: 25 });
        expect(result.indicators.ema.status).toBe("ok");
        expect(result.indicators.ema.value).toBeCloseTo(25.555555555555557);
        expect(result.indicators.rsi).toMatchObject({ status: "ok", value: 100 });
    });

    it("reports invalid numeric records explicitly and excludes them from analysis", () => {
        const result = analyzeMarketData({
            symbol: "BTCUSDT",
            timeframe: "1h",
            records: [record(bars[0].timestamp, 10), { ...record(bars[1].timestamp, 20), data: { close: Number.POSITIVE_INFINITY } }],
        }, { smaPeriod: 1, emaPeriod: 1, rsiPeriod: 1 });
        expect(result.ok).toBe(false);
        expect(result.dataQuality).toMatchObject({ status: "insufficient-data", validRecords: 1, invalidRecords: 1, totalRecords: 2 });
        expect(result.dataQuality.issues).toContain("record 1: malformed numeric data");
        expect(result.statistics.observations).toBe(1);
    });

    it("rejects invalid timestamps, symbol mismatches, and timeframe mismatches", () => {
        const result = analyzeMarketData({
            symbol: "BTCUSDT",
            timeframe: "1h",
            records: [
                { ...record(bars[0].timestamp, 10), timestamp: "not-a-time" },
                record(bars[1].timestamp, 20, "ETHUSDT"),
                record(bars[2].timestamp, 30, "BTCUSDT", "4h"),
            ],
        });
        expect(result.dataQuality.invalidRecords).toBe(3);
        expect(result.dataQuality.issues).toEqual(expect.arrayContaining([
            "record 0: invalid timestamp",
            "record 1: symbol mismatch",
            "record 2: timeframe mismatch",
        ]));
        expect(result.statistics.observations).toBe(0);
    });

    it("reports empty data and malformed records as data-quality failures", () => {
        const empty = analyzeMarketData({ symbol: "BTCUSDT", timeframe: "1h", records: [] });
        expect(empty.ok).toBe(false);
        expect(empty.dataQuality.status).toBe("invalid");
        expect(empty.dataQuality.issues).toContain("market data is empty");
        const malformed = analyzeMarketData({ symbol: "BTCUSDT", timeframe: "1h", records: [null] });
        expect(malformed.dataQuality.issues).toContain("record 0: invalid record");
        expect(malformed.dataQuality.invalidRecords).toBe(1);
    });

    it("uses the latest timestamp instead of input order", () => {
        const result = analyzeMarketData({
            symbol: "BTCUSDT",
            timeframe: "1h",
            records: [record(bars[2].timestamp, 30), record(bars[0].timestamp, 10), record(bars[1].timestamp, 20)],
        }, { smaPeriod: 1, emaPeriod: 1, rsiPeriod: 1 });
        expect(result.timestamp).toBe("2024-01-01T02:00:00.000Z");
        expect(result.statistics.latestBar?.close).toBe(30);
    });
});
