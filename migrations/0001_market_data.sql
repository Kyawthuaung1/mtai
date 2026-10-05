CREATE TABLE IF NOT EXISTS market_data (
  record_id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(source, symbol, timeframe, timestamp)
);

CREATE INDEX IF NOT EXISTS idx_market_data_symbol_time
ON market_data(symbol, timeframe, timestamp);

CREATE INDEX IF NOT EXISTS idx_market_data_source_time
ON market_data(source, timestamp);
