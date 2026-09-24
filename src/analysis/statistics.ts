import type { MarketDataRecord } from "../agents/types";
import type { AnalysisSourcePoint, StatisticsSummary } from "./types";
import { parseNumeric } from "./validation";

function numericOrUndefined(value: unknown): number | undefined {
    return parseNumeric(value);
}

function readBarObject(candidate: Record<string, unknown>): AnalysisSourcePoint | undefined {
    const openVal = numericOrUndefined(candidate.open);
    const highVal = numericOrUndefined(candidate.high);
    const lowVal = numericOrUndefined(candidate.low);
    const closeVal = numericOrUndefined(candidate.close ?? candidate.price ?? candidate.last ?? candidate.value);
    const volumeVal = numericOrUndefined(candidate.volume ?? candidate.volume_24h ?? candidate.quoteVolume ?? candidate.turnover);

    if (closeVal !== undefined || openVal !== undefined || highVal !== undefined || lowVal !== undefined) {
        const finalClose = closeVal ?? openVal ?? highVal ?? lowVal ?? 0;
        const finalOpen = openVal ?? finalClose;
        const finalHigh = highVal ?? Math.max(finalOpen, finalClose);
        const finalLow = lowVal ?? Math.min(finalOpen, finalClose);
        const timestamp = typeof candidate.timestamp === "string"
            ? candidate.timestamp
            : typeof candidate.time === "string"
                ? candidate.time
                : typeof candidate.timeOpen === "string"
                    ? candidate.timeOpen
                    : new Date(0).toISOString();

        return {
            timestamp,
            open: finalOpen,
            high: finalHigh,
            low: finalLow,
            close: finalClose,
            volume: volumeVal,
        };
    }

    return undefined;
}

function collectCandidateObjects(value: unknown, seen = new Set<object>()): Record<string, unknown>[] {
    const results: Record<string, unknown>[] = [];
    if (!value || typeof value !== "object") return results;
    if (Array.isArray(value)) {
        for (const item of value) {
            results.push(...collectCandidateObjects(item, seen));
        }
        return results;
    }
    const candidate = value as Record<string, unknown>;
    if (seen.has(candidate)) return results;
    seen.add(candidate);
    results.push(candidate);
    for (const item of Object.values(candidate)) {
        results.push(...collectCandidateObjects(item, seen));
    }
    return results;
}

export function extractBarFromRecord(record: MarketDataRecord): AnalysisSourcePoint | undefined {
    const data = record.data;
    if (!data || typeof data !== "object") return undefined;

    const direct = readBarObject(data as Record<string, unknown>);
    if (direct) return direct;

    const candidates = collectCandidateObjects(data);
    for (const candidate of candidates) {
        const bar = readBarObject(candidate);
        if (bar) return bar;
    }

    if (Array.isArray(data.klines)) {
        const lastKline = data.klines[data.klines.length - 1];
        if (Array.isArray(lastKline) && lastKline.length >= 6) {
            const [openTime, open, high, low, close, volume] = lastKline as [unknown, unknown, unknown, unknown, unknown, unknown];
            const parsedOpen = numericOrUndefined(open);
            const parsedHigh = numericOrUndefined(high);
            const parsedLow = numericOrUndefined(low);
            const parsedClose = numericOrUndefined(close);
            const parsedVolume = numericOrUndefined(volume);
            if (parsedClose !== undefined || parsedOpen !== undefined || parsedHigh !== undefined || parsedLow !== undefined) {
                return {
                    timestamp: typeof openTime === "number" ? new Date(openTime).toISOString() : new Date().toISOString(),
                    open: parsedOpen ?? parsedClose ?? parsedHigh ?? parsedLow ?? 0,
                    high: parsedHigh ?? Math.max(parsedOpen ?? parsedClose ?? 0, parsedClose ?? parsedOpen ?? 0),
                    low: parsedLow ?? Math.min(parsedOpen ?? parsedClose ?? 0, parsedClose ?? parsedOpen ?? 0),
                    close: parsedClose ?? parsedOpen ?? parsedHigh ?? parsedLow ?? 0,
                    volume: parsedVolume,
                };
            }
        }
    }

    if (Array.isArray(data.candles)) {
        const lastCandle = data.candles[data.candles.length - 1];
        if (lastCandle && typeof lastCandle === "object") {
            const bar = readBarObject(lastCandle as Record<string, unknown>);
            if (bar) return bar;
        }
    }

    return undefined;
}

export function deriveStatisticsFromRecords(records: MarketDataRecord[]): StatisticsSummary {
    const bars = records
        .map((record) => extractBarFromRecord(record))
        .filter((bar): bar is AnalysisSourcePoint => Boolean(bar));

    const closes = bars
        .map((bar) => bar.close)
        .filter((value): value is number => value !== undefined && Number.isFinite(value));

    const volumes = bars
        .map((bar) => bar.volume)
        .filter((value): value is number => value !== undefined && Number.isFinite(value));

    const highValues = bars
        .map((bar) => bar.high)
        .filter((value): value is number => value !== undefined && Number.isFinite(value));

    const lowValues = bars
        .map((bar) => bar.low)
        .filter((value): value is number => value !== undefined && Number.isFinite(value));

    const openValues = bars
        .map((bar) => bar.open)
        .filter((value): value is number => value !== undefined && Number.isFinite(value));

    const latestBar = bars.at(-1);
    const previousClose = closes.length > 1 ? closes.at(-2) : undefined;
    const lastClose = closes.at(-1);
    const averagePrice = closes.length > 0 ? closes.reduce((sum, value) => sum + value, 0) / closes.length : undefined;
    const minPrice = closes.length > 0 ? Math.min(...closes) : undefined;
    const maxPrice = closes.length > 0 ? Math.max(...closes) : undefined;

    const returns = [] as number[];
    for (let index = 1; index < closes.length; index += 1) {
        const previous = closes[index - 1];
        if (previous === 0) {
            returns.push(0);
            continue;
        }
        returns.push((closes[index] - previous) / previous);
    }

    const meanReturn = returns.length > 0 ? returns.reduce((sum, value) => sum + value, 0) / returns.length : 0;
    const volatility = returns.length > 0
        ? Math.sqrt(returns.reduce((sum, value) => sum + (value - meanReturn) ** 2, 0) / returns.length)
        : undefined;

    return {
        latestPrice: lastClose,
        open: openValues.at(-1),
        high: highValues.length > 0 ? Math.max(...highValues) : undefined,
        low: lowValues.length > 0 ? Math.min(...lowValues) : undefined,
        close: lastClose,
        volume: volumes.length > 0 ? volumes.at(-1) : undefined,
        absoluteChange: lastClose !== undefined && previousClose !== undefined ? lastClose - previousClose : undefined,
        percentageChange: lastClose !== undefined && previousClose !== undefined && previousClose !== 0
            ? ((lastClose - previousClose) / previousClose) * 100
            : undefined,
        volatility,
        averagePrice,
        minPrice,
        maxPrice,
        observations: closes.length,
    };
}

export function buildLatestBar(records: MarketDataRecord[]): AnalysisSourcePoint | undefined {
    const bars = records
        .map((record) => extractBarFromRecord(record))
        .filter((bar): bar is AnalysisSourcePoint => Boolean(bar));

    if (bars.length === 0) return undefined;
    return bars.reduce((latest, candidate) => {
        const latestDate = Date.parse(latest.timestamp);
        const candidateDate = Date.parse(candidate.timestamp);
        if (Number.isNaN(latestDate) || Number.isNaN(candidateDate)) return latest;
        return candidateDate > latestDate ? candidate : latest;
    }, bars[0]);
}
