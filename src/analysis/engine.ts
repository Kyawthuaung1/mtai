import type { MarketDataRecord } from "../agents/types";
import { calculateEMA, calculateRSI, calculateSMA } from "./indicators";
import { buildLatestBar, deriveStatisticsFromRecords, extractBarFromRecord } from "./statistics";
import type { AnalysisRequest, AnalysisResult, DataQualityReport } from "./types";
import { normalizeSymbol, normalizeTimeframe, parseTimestamp } from "./validation";

export interface AnalysisEngineOptions {
    smaPeriod?: number;
    emaPeriod?: number;
    rsiPeriod?: number;
}

function validateRecords(request: AnalysisRequest): { quality: DataQualityReport; valid: MarketDataRecord[]; errors: string[] } {
    const issues: string[] = [];
    const valid: MarketDataRecord[] = [];
    const expectedSymbol = normalizeSymbol(request.symbol);
    const expectedTimeframe = normalizeTimeframe(request.timeframe);

    if (!expectedSymbol) issues.push("symbol is required");
    if (!expectedTimeframe) issues.push("timeframe is required");
    if (!Array.isArray(request.records) || request.records.length === 0) issues.push("market data is empty");

    for (const [index, record] of (Array.isArray(request.records) ? request.records : []).entries()) {
        if (!record || typeof record !== "object") {
            issues.push(`record ${index}: invalid record`);
            continue;
        }
        const symbol = normalizeSymbol(record.symbol);
        const timeframe = normalizeTimeframe(record.timeframe);
        if (!symbol) issues.push(`record ${index}: missing symbol`);
        else if (expectedSymbol && symbol !== expectedSymbol) issues.push(`record ${index}: symbol mismatch`);
        if (!timeframe) issues.push(`record ${index}: missing timeframe`);
        else if (expectedTimeframe && timeframe !== expectedTimeframe) issues.push(`record ${index}: timeframe mismatch`);
        if (!parseTimestamp(record.timestamp)) issues.push(`record ${index}: invalid timestamp`);
        if (!record.data || typeof record.data !== "object" || Array.isArray(record.data)) issues.push(`record ${index}: invalid data`);

        const bar = extractBarFromRecord(record);
        if (!bar || bar.close === undefined || !Number.isFinite(bar.close)) {
            issues.push(`record ${index}: malformed numeric data`);
            continue;
        }
        valid.push(record);
    }

    const invalidRecords = (Array.isArray(request.records) ? request.records.length : 0) - valid.length;
    const status = issues.length > 0 ? (valid.length === 0 ? "invalid" : "insufficient-data") : "ok";
    return {
        quality: {
            status,
            issues: [...new Set(issues)],
            validRecords: valid.length,
            invalidRecords: Math.max(0, invalidRecords),
            totalRecords: Array.isArray(request.records) ? request.records.length : 0,
        },
        valid,
        errors: [...new Set(issues)],
    };
}

export function analyzeMarketData(request: AnalysisRequest, options: AnalysisEngineOptions = {}): AnalysisResult {
    const symbol = normalizeSymbol(request.symbol) ?? "";
    const timeframe = normalizeTimeframe(request.timeframe) ?? "";
    const validation = validateRecords(request);
    const statistics = deriveStatisticsFromRecords(validation.valid);
    const closes = validation.valid
        .map((record) => extractBarFromRecord(record)?.close)
        .filter((value): value is number => value !== undefined && Number.isFinite(value));
    const smaPeriod = options.smaPeriod ?? 20;
    const emaPeriod = options.emaPeriod ?? 20;
    const rsiPeriod = options.rsiPeriod ?? 14;
    const latest = buildLatestBar(validation.valid);
    const quality = validation.quality;
    const indicators = {
        sma: calculateSMA(closes, smaPeriod),
        ema: calculateEMA(closes, emaPeriod),
        rsi: calculateRSI(closes, rsiPeriod),
    };
    const indicatorInsufficient = Object.values(indicators).some((indicator) => indicator.status === "insufficient-data");
    if (quality.status === "ok" && indicatorInsufficient) quality.status = "insufficient-data";
    if (quality.status === "ok" && closes.length === 0) quality.status = "insufficient-data";
    if (indicatorInsufficient && !quality.issues.includes("insufficient observations")) quality.issues.push("insufficient observations");

    return {
        ok: quality.status === "ok",
        symbol,
        timeframe,
        timestamp: latest?.timestamp ?? new Date(0).toISOString(),
        dataQuality: quality,
        statistics,
        indicators,
        errors: validation.errors.length > 0 ? validation.errors : undefined,
    };
}

export class AnalysisEngine {
    constructor(private readonly options: AnalysisEngineOptions = {}) {}

    analyze(request: AnalysisRequest): AnalysisResult {
        return analyzeMarketData(request, this.options);
    }
}

export const executeAnalysis = analyzeMarketData;
