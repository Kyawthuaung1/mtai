import type {
  MarketDataQuery,
  MarketDataRecord,
  MarketDataStore,
} from "../agents/types";

export class D1MarketDataStore implements MarketDataStore {
  constructor(
    private readonly database: D1Database,
    private readonly table = "market_data",
  ) {}

  async save(records: MarketDataRecord[]): Promise<void> {
    await this.upsert(records);
  }

  async upsert(records: MarketDataRecord[]): Promise<void> {
    if (records.length === 0) return;

    const statements = records.map((record) => {
      const source = record.source.toLowerCase();
      const symbol = record.symbol.toUpperCase();
      const timeframe = record.timeframe.toLowerCase();
      const timestamp = new Date(record.timestamp).toISOString();
      const recordId = [
        source,
        symbol,
        timeframe,
        timestamp,
      ].map(encodeURIComponent).join("|");

      return this.database
        .prepare(
          `INSERT INTO ${this.table}
           (record_id, source, symbol, timeframe, timestamp, data)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(record_id) DO UPDATE SET
             data = excluded.data`,
        )
        .bind(
          recordId,
          source,
          symbol,
          timeframe,
          timestamp,
          JSON.stringify(record.data),
        );
    });

    await this.database.batch(statements);
  }

  async all(): Promise<MarketDataRecord[]> {
    const result = await this.database
      .prepare(
        `SELECT source, symbol, timeframe, timestamp, data
         FROM ${this.table}
         ORDER BY timestamp ASC`,
      )
      .all<{
        source: string;
        symbol: string;
        timeframe: string;
        timestamp: string;
        data: string;
      }>();

    return result.results.map((row) => ({
      source: row.source as MarketDataRecord["source"],
      symbol: row.symbol,
      timeframe: row.timeframe,
      timestamp: row.timestamp,
      data: JSON.parse(row.data) as Record<string, unknown>,
    }));
  }

  async query(
    query: MarketDataQuery = {},
  ): Promise<MarketDataRecord[]> {
    const clauses: string[] = [];
    const bindings: unknown[] = [];

    if (query.source) {
      clauses.push("source = ?");
      bindings.push(query.source.toLowerCase());
    }

    if (query.symbol) {
      clauses.push("symbol = ?");
      bindings.push(query.symbol.toUpperCase());
    }

    if (query.timeframe) {
      clauses.push("timeframe = ?");
      bindings.push(query.timeframe.toLowerCase());
    }

    if (query.from) {
      clauses.push("timestamp >= ?");
      bindings.push(new Date(query.from).toISOString());
    }

    if (query.to) {
      clauses.push("timestamp <= ?");
      bindings.push(new Date(query.to).toISOString());
    }

    const where = clauses.length
      ? `WHERE ${clauses.join(" AND ")}`
      : "";

    const result = await this.database
      .prepare(
        `SELECT source, symbol, timeframe, timestamp, data
         FROM ${this.table}
         ${where}
         ORDER BY timestamp ASC`,
      )
      .bind(...bindings)
      .all<{
        source: string;
        symbol: string;
        timeframe: string;
        timestamp: string;
        data: string;
      }>();

    return result.results.map((row) => ({
      source: row.source as MarketDataRecord["source"],
      symbol: row.symbol,
      timeframe: row.timeframe,
      timestamp: row.timestamp,
      data: JSON.parse(row.data) as Record<string, unknown>,
    }));
cat > src/market-data/d1.ts <<'EOF'
import type {
  MarketDataQuery,
  MarketDataRecord,
  MarketDataStore,
} from "../agents/types";

export class D1MarketDataStore implements MarketDataStore {
  constructor(
    private readonly database: D1Database,
    private readonly table = "market_data",
  ) {}

  async save(records: MarketDataRecord[]): Promise<void> {
    await this.upsert(records);
  }

  async upsert(records: MarketDataRecord[]): Promise<void> {
    if (records.length === 0) return;

    const statements = records.map((record) => {
      const source = record.source.toLowerCase();
      const symbol = record.symbol.toUpperCase();
      const timeframe = record.timeframe.toLowerCase();
      const timestamp = new Date(record.timestamp).toISOString();
      const recordId = [
        source,
        symbol,
        timeframe,
        timestamp,
      ].map(encodeURIComponent).join("|");

      return this.database
        .prepare(
          `INSERT INTO ${this.table}
           (record_id, source, symbol, timeframe, timestamp, data)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(record_id) DO UPDATE SET
             data = excluded.data`,
        )
        .bind(
          recordId,
          source,
          symbol,
          timeframe,
          timestamp,
          JSON.stringify(record.data),
        );
    });

    await this.database.batch(statements);
  }

  async all(): Promise<MarketDataRecord[]> {
    const result = await this.database
      .prepare(
        `SELECT source, symbol, timeframe, timestamp, data
         FROM ${this.table}
         ORDER BY timestamp ASC`,
      )
      .all<{
        source: string;
        symbol: string;
        timeframe: string;
        timestamp: string;
        data: string;
      }>();

    return result.results.map((row) => ({
      source: row.source as MarketDataRecord["source"],
      symbol: row.symbol,
      timeframe: row.timeframe,
      timestamp: row.timestamp,
      data: JSON.parse(row.data) as Record<string, unknown>,
    }));
  }

  async query(
    query: MarketDataQuery = {},
  ): Promise<MarketDataRecord[]> {
    const clauses: string[] = [];
    const bindings: unknown[] = [];

    if (query.source) {
      clauses.push("source = ?");
      bindings.push(query.source.toLowerCase());
    }

    if (query.symbol) {
      clauses.push("symbol = ?");
      bindings.push(query.symbol.toUpperCase());
    }

    if (query.timeframe) {
      clauses.push("timeframe = ?");
      bindings.push(query.timeframe.toLowerCase());
    }

    if (query.from) {
      clauses.push("timestamp >= ?");
      bindings.push(new Date(query.from).toISOString());
    }

    if (query.to) {
      clauses.push("timestamp <= ?");
      bindings.push(new Date(query.to).toISOString());
    }

    const where = clauses.length
      ? `WHERE ${clauses.join(" AND ")}`
      : "";

    const result = await this.database
      .prepare(
        `SELECT source, symbol, timeframe, timestamp, data
         FROM ${this.table}
         ${where}
         ORDER BY timestamp ASC`,
      )
      .bind(...bindings)
      .all<{
        source: string;
        symbol: string;
        timeframe: string;
        timestamp: string;
        data: string;
      }>();

    return result.results.map((row) => ({
      source: row.source as MarketDataRecord["source"],
      symbol: row.symbol,
      timeframe: row.timeframe,
      timestamp: row.timestamp,
      data: JSON.parse(row.data) as Record<string, unknown>,
    }));
  }
}
