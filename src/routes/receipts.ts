import type { FastifyInstance } from "fastify";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { Db } from "../db/index.js";
import { isValidCnpj, normalizeCnpj } from "../services/cnpj.js";
import { LlmUnavailableError, type Extractor } from "../services/extract.js";
import { listReceipts, summarize, toCsv } from "../services/report.js";

const Body = z.union([
  z.object({ text: z.string().trim().min(10).max(20_000) }),
  z.object({ imageBase64: z.string().min(100) }),
]);
const Query = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "use YYYY-MM") });

export interface ReceiptDeps {
  db: Db;
  extract: Extractor;
}

export function receiptRoutes({ db, extract }: ReceiptDeps) {
  const byHash = db.prepare("SELECT id FROM receipts WHERE hash = ?");
  const insert = db.prepare(
    `INSERT INTO receipts (hash, issued_on, vendor, cnpj, cnpj_valid, total_cents, currency, category, needs_review)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  return async (app: FastifyInstance) => {
    app.post("/receipts", async (req, reply) => {
      const body = Body.safeParse(req.body);
      if (!body.success) {
        return reply.code(400).send({ error: "Envie { text } ou { imageBase64 }", details: z.flattenError(body.error) });
      }
      const input = body.data;
      const hash = createHash("sha256").update("text" in input ? input.text : input.imageBase64).digest("hex");

      const existing = byHash.get(hash) as { id: number } | undefined;
      if (existing) return reply.code(200).send({ id: existing.id, duplicate: true });

      try {
        const ex = await extract(input);
        const cnpj = normalizeCnpj(ex.cnpj);
        const cnpjValid = isValidCnpj(cnpj);
        const totalCents = Math.round(ex.total * 100);
        // Tudo que o código não consegue confirmar fica marcado para o humano revisar.
        // Não convertemos moeda: documento em outra moeda sempre vai para revisão.
        const needsReview = ex.currency !== "BRL" || !cnpjValid || ex.issuedOn === null || totalCents <= 0;
        const { lastInsertRowid } = insert.run(
          hash, ex.issuedOn, ex.vendor, cnpj, cnpjValid ? 1 : 0, totalCents, ex.currency, ex.category, needsReview ? 1 : 0,
        );
        return reply.code(201).send({
          id: Number(lastInsertRowid), duplicate: false, vendor: ex.vendor, cnpj, cnpjValid,
          issuedOn: ex.issuedOn, totalCents, currency: ex.currency, category: ex.category, needsReview,
        });
      } catch (err) {
        if (err instanceof LlmUnavailableError) return reply.code(503).send({ error: err.message });
        throw err;
      }
    });

    const withMonth = (handler: (month: string) => unknown) => async (req: any, reply: any) => {
      const q = Query.safeParse(req.query);
      if (!q.success) return reply.code(400).send({ error: "Parâmetro month inválido", details: z.flattenError(q.error) });
      return handler(q.data.month);
    };

    app.get("/receipts", withMonth((m) => listReceipts(db, m)));
    app.get("/summary", withMonth((m) => summarize(db, m)));
    app.get("/export.csv", async (req, reply) => {
      const q = Query.safeParse(req.query);
      if (!q.success) return reply.code(400).send({ error: "Parâmetro month inválido" });
      return reply
        .header("content-type", "text/csv; charset=utf-8")
        .header("content-disposition", `attachment; filename="recibos-${q.data.month}.csv"`)
        .send(toCsv(listReceipts(db, q.data.month)));
    });
  };
}
