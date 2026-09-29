import type { IndicatorResult } from "./types";

function validSeries(values: readonly number[]): number[] {
    return values.filter((value) => Number.isFinite(value));
}

function invalidPeriod(period: number, count: number): IndicatorResult | undefined {
    if (!Number.isInteger(period) || period <= 0) {
        return { period, count, status: "invalid", reason: "period must be a positive integer" };
    }
    return undefined;
}

function insufficient(period: number, count: number, required: string): IndicatorResult {
    return { period, count, status: "insufficient-data", reason: `Need ${required} ${period} observations; received ${count}` };
}

function invalidCalculation(period: number, count: number, name: string): IndicatorResult {
    return { period, count, status: "invalid", reason: `${name} could not be calculated safely` };
}

export function calculateSMA(values: readonly number[], period: number): IndicatorResult {
    const series = validSeries(values);
    const invalid = invalidPeriod(period, series.length);
    if (invalid) return invalid;
    if (series.length < period) return insufficient(period, series.length, "at least");
    const window = series.slice(-period);
    const value = window.reduce((sum, item) => sum + item / period, 0);
    return Number.isFinite(value)
        ? { period, count: series.length, status: "ok", value }
        : invalidCalculation(period, series.length, "SMA");
}

/** EMA is seeded with the first observation, then uses alpha = 2 / (period + 1). */
export function calculateEMA(values: readonly number[], period: number): IndicatorResult {
    const series = validSeries(values);
    const invalid = invalidPeriod(period, series.length);
    if (invalid) return invalid;
    if (series.length < period) return insufficient(period, series.length, "at least");
    const alpha = 2 / (period + 1);
    let ema = series[0];
    for (let index = 1; index < series.length; index += 1) {
        ema += alpha * (series[index] - ema);
        if (!Number.isFinite(ema)) return invalidCalculation(period, series.length, "EMA");
    }
    return { period, count: series.length, status: "ok", value: ema };
}

export function calculateRSI(values: readonly number[], period: number): IndicatorResult {
    const series = validSeries(values);
    const invalid = invalidPeriod(period, series.length);
    if (invalid) return invalid;
    if (series.length <= period) return insufficient(period, series.length, "more than");

    const changes: number[] = [];
    for (let index = 1; index < series.length; index += 1) {
        const change = series[index] - series[index - 1];
        if (!Number.isFinite(change)) return invalidCalculation(period, series.length, "RSI");
        changes.push(change);
    }
    const gains = changes.map((change) => Math.max(change, 0));
    const losses = changes.map((change) => Math.max(-change, 0));
    let averageGain = gains.slice(0, period).reduce((sum, value) => sum + value / period, 0);
    let averageLoss = losses.slice(0, period).reduce((sum, value) => sum + value / period, 0);
    if (!Number.isFinite(averageGain) || !Number.isFinite(averageLoss)) return invalidCalculation(period, series.length, "RSI");
    for (let index = period; index < changes.length; index += 1) {
        averageGain = (averageGain * (period - 1) + gains[index]) / period;
        averageLoss = (averageLoss * (period - 1) + losses[index]) / period;
        if (!Number.isFinite(averageGain) || !Number.isFinite(averageLoss)) return invalidCalculation(period, series.length, "RSI");
    }
    const value = averageLoss === 0 ? 100 : averageGain === 0 ? 0 : 100 - 100 / (1 + averageGain / averageLoss);
    return Number.isFinite(value)
        ? { period, count: series.length, status: "ok", value }
        : invalidCalculation(period, series.length, "RSI");
}
