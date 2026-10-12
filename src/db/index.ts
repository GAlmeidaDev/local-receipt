import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type Db = Database.Database;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS receipts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  hash         TEXT    NOT NULL UNIQUE,   -- evita lançar o mesmo documento duas vezes
  issued_on    TEXT,                      -- YYYY-MM-DD
  vendor       TEXT    NOT NULL,
  cnpj         TEXT,                      -- só dígitos
  cnpj_valid   INTEGER NOT NULL DEFAULT 0,
  total_cents  INTEGER NOT NULL,
  currency     TEXT    NOT NULL DEFAULT 'BRL',
  category     TEXT    NOT NULL,
  needs_review INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_receipts_issued_on ON receipts (issued_on);
`;

export function openDb(path: string): Db {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA);
  return db;
}
