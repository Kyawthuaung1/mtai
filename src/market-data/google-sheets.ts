import type {
  MarketDataQuery,
  MarketDataRecord,
  MarketDataStore,
} from "../agents/types";

export interface GoogleSheetsClient {
  appendRows(values: string[][]): Promise<void>;
  readRows(): Promise<string[][]>;
}

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

function matches(record: MarketDataRecord, query: MarketDataQuery = {}): boolean {
  if (query.source && record.source !== query.source.toLowerCase()) return false;
  if (query.symbol && record.symbol !== query.symbol.toUpperCase()) return false;
  if (query.timeframe && record.timeframe !== query.timeframe.toLowerCase()) return false;

  if (query.from && record.timestamp < new Date(query.from).toISOString()) {
    return false;
  }

  if (query.to && record.timestamp > new Date(query.to).toISOString()) {
    return false;
  }

  return true;
}

const HEADER = [
  "record_id",
  "source",
  "symbol",
  "timeframe",
  "timestamp",
  "data",
];

function id(record: MarketDataRecord): string {
  const normalized = normalize(record);

  return [
    normalized.source,
    normalized.symbol,
    normalized.timeframe,
    normalized.timestamp,
  ].map(encodeURIComponent).join("|");
}

function toRow(record: MarketDataRecord): string[] {
  const normalized = normalize(record);

  return [
    id(normalized),
    normalized.source,
    normalized.symbol,
    normalized.timeframe,
    normalized.timestamp,
    JSON.stringify(normalized.data),
  ];
}

function fromRow(row: string[]): MarketDataRecord | null {
  if (row.length < HEADER.length) return null;

  try {
    const source = row[1];
    if (source !== "cmc" && source !== "binance" && source !== "browser") {
      return null;
    }

    return normalize({
      source,
      symbol: row[2],
      timeframe: row[3],
      timestamp: row[4],
      data: JSON.parse(row[5]) as Record<string, unknown>,
    });
  } catch {
    return null;
  }
}

export class GoogleSheetsMarketDataStore implements MarketDataStore {
  constructor(private readonly client: GoogleSheetsClient) {}

  async save(records: MarketDataRecord[]): Promise<void> {
    await this.upsert(records);
  }

  async upsert(records: MarketDataRecord[]): Promise<void> {
    if (records.length === 0) return;

    const existing = await this.all();
    const byId = new Map(existing.map((record) => [id(record), record]));

    for (const record of records) {
      const normalized = normalize(record);
      byId.set(id(normalized), normalized);
    }

    const rows = [
      HEADER,
      ...[...byId.values()]
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
        .map(toRow),
    ];

    await this.client.appendRows(rows);
  }

  async all(): Promise<MarketDataRecord[]> {
    const rows = await this.client.readRows();

    const start = rows[0]?.join("|") === HEADER.join("|") ? 1 : 0;

    return rows
      .slice(start)
      .map(fromRow)
      .filter((record): record is MarketDataRecord => record !== null)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  async query(query: MarketDataQuery = {}): Promise<MarketDataRecord[]> {
    return (await this.all()).filter((record) => matches(record, query));
  }
}
