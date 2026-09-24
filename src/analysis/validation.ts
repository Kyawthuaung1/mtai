export function isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

export function parseNumeric(value: unknown): number | undefined {
    if (typeof value === "number") {
        if (!Number.isFinite(value)) return undefined;
        return value;
    }
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed) return undefined;
        const parsed = Number(trimmed);
        if (!Number.isFinite(parsed)) return undefined;
        return parsed;
    }
    return undefined;
}

export function parseTimestamp(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    return Number.isNaN(Date.parse(trimmed)) ? undefined : trimmed;
}

export function normalizeSymbol(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed ? trimmed.toUpperCase() : undefined;
}

export function normalizeTimeframe(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed || undefined;
}
