import type { IndicatorResult } from "./types";

function validSeries(values: number[]): number[] {
    return values.filter((value) => Number.isFinite(value));
}

function invalidPeriod(period: number, count: number): IndicatorResult | undefined {
    if (!Number.isInteger(period) || period <= 0) {
        return { period, count, status: "invalid", reason: "period must be a positive integer" };
    }
    return undefined;
}

export function calculateSMA(values: number[], period: number): IndicatorResult {
    const series = validSeries(values);
    const invalid = invalidPeriod(period, series.length);
    if (invalid) return invalid;
    if (series.length < period) {
        return { period, count: series.length, status: "insufficient-data", reason: `Need at least ${period} observations; received ${series.length}` };
    }
    const window = series.slice(-period);
    return { period, count: series.length, status: "ok", value: window.reduce((sum, value) => sum + value, 0) / period };
}

/** EMA is seeded with the first observation, then uses alpha = 2 / (period + 1). */
export function calculateEMA(values: number[], period: number): IndicatorResult {
    const series = validSeries(values);
    const invalid = invalidPeriod(period, series.length);
    if (invalid) return invalid;
    if (series.length < period) {
        return { period, count: series.length, status: "insufficient-data", reason: `Need at least ${period} observations; received ${series.length}` };
    }
    const alpha = 2 / (period + 1);
    let ema = series[0];
    for (let index = 1; index < series.length; index += 1) ema += alpha * (series[index] - ema);
    return { period, count: series.length, status: "ok", value: ema };
}

export function calculateRSI(values: number[], period: number): IndicatorResult {
    const series = validSeries(values);
    const invalid = invalidPeriod(period, series.length);
    if (invalid) return invalid;
    if (series.length <= period) {
        return { period, count: series.length, status: "insufficient-data", reason: `Need more than ${period} observations; received ${series.length}` };
    }

    const changes = series.slice(1).map((value, index) => value - series[index]);
    const gains = changes.map((change) => Math.max(change, 0));
    const losses = changes.map((change) => Math.max(-change, 0));
    let averageGain = gains.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
    let averageLoss = losses.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
    for (let index = period; index < changes.length; index += 1) {
        averageGain = (averageGain * (period - 1) + gains[index]) / period;
        averageLoss = (averageLoss * (period - 1) + losses[index]) / period;
    }
    const value = averageLoss === 0 ? 100 : averageGain === 0 ? 0 : 100 - 100 / (1 + averageGain / averageLoss);
    return { period, count: series.length, status: "ok", value: Number.isFinite(value) ? value : undefined, reason: Number.isFinite(value) ? undefined : "RSI could not be calculated safely" };
}
