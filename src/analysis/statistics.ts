import type { AnalysisSourcePoint, NormalizedMarketDataRecord, StatisticsSummary } from "./types";
import { parseEpochTimestamp, parseNumeric, parseTimestamp } from "./validation";

const NUMERIC_KEYS = ["open", "high", "low", "close", "price", "last", "value", "volume", "volume_24h", "quoteVolume", "turnover"] as const;
const CLOSE_KEYS = ["close", "price", "last", "value"] as const;
const TIME_KEYS = ["timestamp", "time", "timeOpen", "openTime"] as const;

function firstNumeric(candidate: Record<string, unknown>, keys: readonly string[]): number | undefined {
    for (const key of keys) {
        if (candidate[key] !== undefined && candidate[key] !== null) return parseNumeric(candidate[key]);
    }
    return undefined;
}

function timestampValue(candidate: Record<string, unknown>, fallback: string): string | undefined {
    for (const key of TIME_KEYS) {
        const value = candidate[key];
        if (value === undefined || value === null) continue;
        if (typeof value === "number") return parseEpochTimestamp(value);
        return parseTimestamp(value);
    }
    return parseTimestamp(fallback);
}

function readBarObject(candidate: Record<string, unknown>, fallbackTimestamp: string): AnalysisSourcePoint | undefined {
    const containsPriceField = NUMERIC_KEYS.some((key) => candidate[key] !== undefined && candidate[key] !== null);
    if (!containsPriceField) return undefined;

    for (const key of NUMERIC_KEYS) {
        if (candidate[key] !== undefined && candidate[key] !== null && parseNumeric(candidate[key]) === undefined) return undefined;
    }
    const close = firstNumeric(candidate, CLOSE_KEYS);
    if (close === undefined) return undefined;

    const open = parseNumeric(candidate.open) ?? close;
    const high = parseNumeric(candidate.high) ?? Math.max(open, close);
    const low = parseNumeric(candidate.low) ?? Math.min(open, close);
    const volume = firstNumeric(candidate, ["volume", "volume_24h", "quoteVolume", "turnover"]);
    const timestamp = timestampValue(candidate, fallbackTimestamp);
    if (!timestamp) return undefined;

    return { timestamp, open, high, low, close, ...(volume === undefined ? {} : { volume }) };
}

function collectCandidateObjects(value: unknown, seen = new Set<object>()): Record<string, unknown>[] {
    if (!value || typeof value !== "object" || seen.has(value)) return [];
    seen.add(value);
    if (Array.isArray(value)) return value.flatMap((item) => collectCandidateObjects(item, seen));
    const candidate = value as Record<string, unknown>;
    return [candidate, ...Object.values(candidate).flatMap((item) => collectCandidateObjects(item, seen))];
}

function findKlineArrays(value: unknown, seen = new Set<object>()): unknown[][] {
    if (!value || typeof value !== "object" || seen.has(value)) return [];
    seen.add(value);
    if (Array.isArray(value)) return value.flatMap((item) => findKlineArrays(item, seen));
    const candidate = value as Record<string, unknown>;
    const found = Array.isArray(candidate.klines) ? [candidate.klines] : [];
    return [...found, ...Object.values(candidate).flatMap((item) => findKlineArrays(item, seen))];
}

function readKline(value: unknown, fallbackTimestamp: string): AnalysisSourcePoint | undefined {
    if (!Array.isArray(value) || value.length < 6) return undefined;
    const [openTime, openValue, highValue, lowValue, closeValue, volumeValue] = value;
    const open = parseNumeric(openValue);
    const high = parseNumeric(highValue);
    const low = parseNumeric(lowValue);
    const close = parseNumeric(closeValue);
    const volume = parseNumeric(volumeValue);
    if ([open, high, low, close, volume].some((number) => number === undefined)) return undefined;
    const timestamp = typeof openTime === "number"
        ? parseEpochTimestamp(openTime)
        : parseTimestamp(openTime) ?? (typeof openTime === "string" && Number.isFinite(Number(openTime)) ? parseEpochTimestamp(Number(openTime)) : undefined) ?? parseTimestamp(fallbackTimestamp);
    if (!timestamp) return undefined;
    return { timestamp, open: open!, high: high!, low: low!, close: close!, volume: volume! };
}

export function extractBarFromRecord(record: NormalizedMarketDataRecord): AnalysisSourcePoint | undefined {
    const fallbackTimestamp = parseTimestamp(record.timestamp);
    if (!fallbackTimestamp || !record.data || typeof record.data !== "object" || Array.isArray(record.data)) return undefined;
    const data = record.data;
    const direct = readBarObject(data, fallbackTimestamp);
    if (direct) return direct;

    for (const klines of findKlineArrays(data)) {
        for (let index = klines.length - 1; index >= 0; index -= 1) {
            const bar = readKline(klines[index], fallbackTimestamp);
            if (bar) return bar;
        }
    }

    for (const candidate of collectCandidateObjects(data)) {
        const bar = readBarObject(candidate, fallbackTimestamp);
        if (bar) return bar;
    }
    return undefined;
}

function sortedBars(records: readonly NormalizedMarketDataRecord[]): AnalysisSourcePoint[] {
    return records
        .map((record) => extractBarFromRecord(record))
        .filter((bar): bar is AnalysisSourcePoint => bar !== undefined)
        .sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp)
            || JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

export function deriveStatisticsFromRecords(records: readonly NormalizedMarketDataRecord[]): StatisticsSummary {
    const bars = sortedBars(records);
    const closes = bars.map((bar) => bar.close);
    const latestBar = bars.at(-1) ?? null;
    const previousClose = closes.length > 1 ? closes.at(-2) : undefined;
    const lastClose = closes.at(-1);
    const averagePrice = closes.length > 0 ? closes.reduce((sum, value) => sum + value / closes.length, 0) : undefined;
    const minPrice = closes.length > 0 ? Math.min(...closes) : undefined;
    const maxPrice = closes.length > 0 ? Math.max(...closes) : undefined;
    const returns: number[] = [];
    for (let index = 1; index < closes.length; index += 1) {
        const previous = closes[index - 1];
        const change = previous === 0 ? 0 : (closes[index] - previous) / previous;
        if (Number.isFinite(change)) returns.push(change);
    }
    const meanReturn = returns.length > 0 ? returns.reduce((sum, value) => sum + value / returns.length, 0) : 0;
    const volatility = returns.length > 0
        ? Math.sqrt(returns.reduce((sum, value) => sum + ((value - meanReturn) ** 2) / returns.length, 0))
        : undefined;
    const absoluteChange = lastClose !== undefined && previousClose !== undefined ? lastClose - previousClose : undefined;
    const percentageChange = lastClose !== undefined && previousClose !== undefined && previousClose !== 0
        ? ((lastClose - previousClose) / previousClose) * 100
        : undefined;

    return {
        latestBar,
        latestTimestamp: latestBar?.timestamp ?? null,
        latestPrice: lastClose,
        open: latestBar?.open,
        high: bars.length > 0 ? Math.max(...bars.map((bar) => bar.high ?? bar.close)) : undefined,
        low: bars.length > 0 ? Math.min(...bars.map((bar) => bar.low ?? bar.close)) : undefined,
        close: lastClose,
        volume: latestBar?.volume,
        absoluteChange: Number.isFinite(absoluteChange) ? absoluteChange : undefined,
        percentageChange: Number.isFinite(percentageChange) ? percentageChange : undefined,
        volatility: Number.isFinite(volatility) ? volatility : undefined,
        averagePrice: Number.isFinite(averagePrice) ? averagePrice : undefined,
        minPrice,
        maxPrice,
        observations: closes.length,
    };
}

export function buildLatestBar(records: readonly NormalizedMarketDataRecord[]): AnalysisSourcePoint | undefined {
    return sortedBars(records).at(-1) ?? undefined;
}
