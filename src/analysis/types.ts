export type Timeframe = string;

/** A provider-neutral market-data record accepted by the analysis engine. */
export interface NormalizedMarketDataRecord {
    source?: string;
    symbol: string;
    timeframe: Timeframe;
    timestamp: string;
    data: Record<string, unknown>;
}

export interface AnalysisRequest {
    symbol: string;
    timeframe: Timeframe;
    records: readonly unknown[];
}

export type QualityStatus = "ok" | "insufficient-data" | "invalid";
export type IndicatorStatus = "ok" | "insufficient-data" | "invalid";

export interface DataQualityReport {
    status: QualityStatus;
    issues: string[];
    validRecords: number;
    invalidRecords: number;
    totalRecords: number;
}

export interface IndicatorResult {
    period: number;
    count: number;
    status: IndicatorStatus;
    value?: number;
    reason?: string;
}

export interface AnalysisSourcePoint {
    timestamp: string;
    open?: number;
    high?: number;
    low?: number;
    close: number;
    volume?: number;
}

export interface StatisticsSummary {
    latestBar: AnalysisSourcePoint | null;
    latestTimestamp: string | null;
    latestPrice?: number;
    open?: number;
    high?: number;
    low?: number;
    close?: number;
    volume?: number;
    absoluteChange?: number;
    percentageChange?: number;
    volatility?: number;
    averagePrice?: number;
    minPrice?: number;
    maxPrice?: number;
    observations: number;
}

export interface AnalysisResult {
    ok: boolean;
    symbol: string;
    timeframe: Timeframe;
    timestamp: string;
    dataQuality: DataQualityReport;
    statistics: StatisticsSummary;
    indicators: {
        sma: IndicatorResult;
        ema: IndicatorResult;
        rsi: IndicatorResult;
    };
    errors?: string[];
}
