export type Timeframe = string;

export interface OHLCV {
  timestamp: string; // ISO string
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
}

export interface MarketDataRecord {
  source: string;
  symbol: string;
  timeframe: Timeframe;
  timestamp: string;
  data: Record<string, unknown>;
}

export type QualityStatus = "ok" | "insufficient_data" | "invalid_data" | "symbol_mismatch" | "timeframe_mismatch";

export interface AnalysisResult {
  symbol: string;
  timeframe: Timeframe;
  sampleCount: number;
  quality: QualityStatus;
  statistics?: {
    min: number;
    max: number;
    mean: number;
    median: number;
    variance: number;
    stddev: number;
  } | null;
  indicators?: {
    sma?: Record<string, number | null>;
    ema?: Record<string, number | null>;
    rsi?: Record<string, number | null>;
  } | null;
  errors?: string[];
}
