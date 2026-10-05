import type {
  MarketDataQuery,
  MarketDataRecord,
  MarketDataStore,
} from "../agents/types";

function normalize(record: MarketDataRecord): MarketDataRecord {
  return {
    ...record,
    source: record.source.toLowerCase() as MarketDataRecord["source"],
    symbol: record.symbol.trim().toUpperCase(),
    timeframe: record.timeframe.trim().toLowerCase(),
    timestamp: new Date(record.timestamp).toISOString(),
    data: { ...record.data },
  };
}

export function marketDataId(record: MarketDataRecord): string {
  const normalized = normalize(record);

  return [
    normalized.source,
    normalized.symbol,
    normalized.timeframe,
    normalized.timestamp,
  ]
    .map(encodeURIComponent)
    .join("|");
}

function matches(
  record: MarketDataRecord,
  query: MarketDataQuery = {},
): boolean {
  if (query.source && record.source !== query.source.toLowerCase()) {
    return false;
  }

  if (query.symbol && record.symbol !== query.symbol.toUpperCase()) {
    return false;
  }

  if (
    query.timeframe &&
    record.timeframe !== query.timeframe.toLowerCase()
  ) {
    return false;
  }

  if (query.from && record.timestamp < new Date(query.from).toISOString()) {
    return false;
  }

  if (query.to && record.timestamp > new Date(query.to).toISOString()) {
    return false;
  }

  return true;
}

export class InMemoryMarketDataStore implements MarketDataStore {
  private readonly records = new Map<string, MarketDataRecord>();

  async save(records: MarketDataRecord[]): Promise<void> {
    for (const record of records) {
      const normalized = normalize(record);
      this.records.set(marketDataId(normalized), normalized);
    }
  }

  async upsert(records: MarketDataRecord[]): Promise<void> {
    await this.save(records);
  }

  async query(
    query: MarketDataQuery = {},
  ): Promise<MarketDataRecord[]> {
    return [...this.records.values()].filter((record) =>
      matches(record, query),
    );
  }

  async all(): Promise<MarketDataRecord[]> {
    return this.query();
  }
}

export class CloudflareKVMarketDataStore implements MarketDataStore {
  constructor(
    private readonly namespace: KVNamespace,
    private readonly prefix = "market-data:v1:",
  ) {}

  async save(records: MarketDataRecord[]): Promise<void> {
    await Promise.all(
      records.map((record) => {
        const normalized = normalize(record);

        return this.namespace.put(
          this.prefix + marketDataId(normalized),
          JSON.stringify(normalized),
        );
      }),
    );
  }

  async upsert(records: MarketDataRecord[]): Promise<void> {
    await this.save(records);
  }

  async all(): Promise<MarketDataRecord[]> {
    const output: MarketDataRecord[] = [];
    let cursor: string | undefined;

    do {
      const page = await this.namespace.list({
        prefix: this.prefix,
        cursor,
      });

      const values = await Promise.all(
        page.keys.map(
          (key) =>
            this.namespace.get(
              key.name,
              "json",
            ) as Promise<MarketDataRecord | null>,
        ),
      );

      for (const value of values) {
        if (value) output.push(normalize(value));
      }

      cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor);

    return output.sort((a, b) =>
      a.timestamp.localeCompare(b.timestamp),
    );
  }

  async query(
    query: MarketDataQuery = {},
  ): Promise<MarketDataRecord[]> {
    return (await this.all()).filter((record) =>
      matches(record, query),
    );
  }
}
