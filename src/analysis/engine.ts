import { calculateEMA, calculateRSI, calculateSMA } from "./indicators";
import { buildLatestBar, deriveStatisticsFromRecords, extractBarFromRecord } from "./statistics";
import type { AnalysisRequest, AnalysisResult, DataQualityReport, NormalizedMarketDataRecord } from "./types";
import { normalizeSymbol, normalizeTimeframe, parseTimestamp } from "./validation";

export interface AnalysisEngineOptions {
    smaPeriod?: number;
    emaPeriod?: number;
    rsiPeriod?: number;
}

interface RecordValidation {
    quality: DataQualityReport;
    valid: NormalizedMarketDataRecord[];
    errors: string[];
}

function validateRecords(request: AnalysisRequest): RecordValidation {
    const issues: string[] = [];
    const valid: NormalizedMarketDataRecord[] = [];
    const expectedSymbol = normalizeSymbol(request.symbol);
    const expectedTimeframe = normalizeTimeframe(request.timeframe);

    if (!expectedSymbol) issues.push("symbol is required");
    if (!expectedTimeframe) issues.push("timeframe is required");
    if (!Array.isArray(request.records)) issues.push("market data must be an array");
    else if (request.records.length === 0) issues.push("market data is empty");

    let invalidRecords = 0;
    for (const [index, value] of (Array.isArray(request.records) ? request.records : []).entries()) {
        const recordIssues: string[] = [];
        if (!value || typeof value !== "object" || Array.isArray(value)) {
            recordIssues.push(`record ${index}: invalid record`);
        } else {
            const record = value as Record<string, unknown>;
            const symbol = normalizeSymbol(record.symbol);
            const timeframe = normalizeTimeframe(record.timeframe);
            const timestamp = parseTimestamp(record.timestamp);
            if (!symbol) recordIssues.push(`record ${index}: missing symbol`);
            else if (expectedSymbol && symbol !== expectedSymbol) recordIssues.push(`record ${index}: symbol mismatch`);
            if (!timeframe) recordIssues.push(`record ${index}: missing timeframe`);
            else if (expectedTimeframe && timeframe !== expectedTimeframe) recordIssues.push(`record ${index}: timeframe mismatch`);
            if (!timestamp) recordIssues.push(`record ${index}: invalid timestamp`);
            if (!record.data || typeof record.data !== "object" || Array.isArray(record.data)) {
                recordIssues.push(`record ${index}: invalid data`);
            } else if (symbol && timeframe && timestamp) {
                const candidate = {
                    ...(typeof record.source === "string" ? { source: record.source } : {}),
                    symbol,
                    timeframe,
                    timestamp,
                    data: record.data as Record<string, unknown>,
                };
                if (!extractBarFromRecord(candidate)) recordIssues.push(`record ${index}: malformed numeric data`);
                else if (recordIssues.length === 0) valid.push(candidate);
            }
        }
        if (recordIssues.length > 0) {
            invalidRecords += 1;
            issues.push(...recordIssues);
        }
    }

    const errors = [...new Set(issues)];
    const requestInvalid = !expectedSymbol || !expectedTimeframe || !Array.isArray(request.records) || request.records.length === 0;
    const status = requestInvalid || (invalidRecords > 0 && valid.length === 0)
        ? "invalid"
        : invalidRecords > 0
            ? "insufficient-data"
            : "ok";
    const totalRecords = Array.isArray(request.records) ? request.records.length : 0;
    return {
        quality: { status, issues: errors, validRecords: valid.length, invalidRecords, totalRecords },
        valid,
        errors,
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
    const indicators = {
        sma: calculateSMA(closes, options.smaPeriod ?? 20),
        ema: calculateEMA(closes, options.emaPeriod ?? 20),
        rsi: calculateRSI(closes, options.rsiPeriod ?? 14),
    };
    const indicatorInsufficient = Object.values(indicators).some((indicator) => indicator.status === "insufficient-data");
    if (validation.quality.status === "ok" && indicatorInsufficient) validation.quality.status = "insufficient-data";
    if (indicatorInsufficient && !validation.quality.issues.includes("insufficient observations")) {
        validation.quality.issues.push("insufficient observations");
    }
    const latest = buildLatestBar(validation.valid);

    return {
        ok: validation.quality.status === "ok",
        symbol,
        timeframe,
        timestamp: latest?.timestamp ?? "",
        dataQuality: validation.quality,
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
