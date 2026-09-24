import type { MarketDataRecord } from "../agents/types";

export type AnalysisStatus = "ok" | "insufficient-data" | "invalid";

export interface AnalysisRequest {
    symbol: string;
    timeframe: string;
    records: MarketDataRecord[];
}

export interface AnalysisSourcePoint {
    timestamp: string;
    open?: number;
    high?: number;
    low?: number;
    close?: number;
    volume?: number;
}

export interface IndicatorResult {
    period: number;
    count: number;
    status: AnalysisStatus;
    value?: number;
    reason?: string;
}

export interface StatisticsSummary {
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

export interface DataQualityReport {
    status: AnalysisStatus;
    issues: string[];
    validRecords: number;
    invalidRecords: number;
    totalRecords: number;
}

export interface AnalysisResult {
    ok: boolean;
    symbol: string;
    timeframe: string;
    timestamp: string;
    dataQuality: DataQualityReport;
    statistics: StatisticsSummary;
    indicators: {
        sma?: IndicatorResult;
        ema?: IndicatorResult;
        rsi?: IndicatorResult;
    };
    errors?: string[];
}
