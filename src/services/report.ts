import type { Db } from "../db/index.js";

export interface ReceiptRow {
  id: number;
  issuedOn: string | null;
  vendor: string;
  cnpj: string | null;
  cnpjValid: boolean;
  totalCents: number;
  currency: string;
  category: string;
  needsReview: boolean;
}

const COLS = `id, issued_on AS issuedOn, vendor, cnpj, cnpj_valid AS cnpjValid,
  total_cents AS totalCents, currency, category, needs_review AS needsReview`;

export function listReceipts(db: Db, month: string): ReceiptRow[] {
  const rows = db
    .prepare(`SELECT ${COLS} FROM receipts WHERE substr(issued_on, 1, 7) = ? ORDER BY issued_on, id`)
    .all(month) as (Omit<ReceiptRow, "cnpjValid" | "needsReview"> & { cnpjValid: number; needsReview: number })[];
  return rows.map((r) => ({ ...r, cnpjValid: !!r.cnpjValid, needsReview: !!r.needsReview }));
}

export function summarize(db: Db, month: string) {
  const all = listReceipts(db, month);
  const rows = all.filter((r) => r.currency === "BRL"); // totais só em reais
  const byCategory: Record<string, { count: number; totalCents: number }> = {};
  for (const r of rows) {
    const c = (byCategory[r.category] ??= { count: 0, totalCents: 0 });
    c.count++;
    c.totalCents += r.totalCents;
  }
  return {
    month,
    count: all.length,
    totalCents: rows.reduce((s, r) => s + r.totalCents, 0),
    foreignCurrency: all.length - rows.length,
    needsReview: all.filter((r) => r.needsReview).length,
    byCategory,
  };
}

const brl = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
const cell = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** CSV no padrão do Excel brasileiro: BOM, ponto e vírgula, vírgula decimal. */
export function toCsv(rows: ReceiptRow[]): string {
  const head = "data;fornecedor;cnpj;valor;moeda;categoria;revisar";
  const lines = rows.map((r) =>
    [r.issuedOn ?? "", cell(r.vendor), r.cnpj ?? "", brl(r.totalCents), r.currency, r.category, r.needsReview ? "sim" : "não"].join(";"),
  );
  return "﻿" + [head, ...lines].join("\n") + "\n";
}
