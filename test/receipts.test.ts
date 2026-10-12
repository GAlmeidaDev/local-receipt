import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { openDb } from "../src/db/index.js";
import { isValidCnpj, normalizeCnpj } from "../src/services/cnpj.js";
import type { Extraction } from "../src/services/extract.js";
import { LlmUnavailableError } from "../src/services/extract.js";

const VALID = "11.222.333/0001-81";

describe("cnpj", () => {
  it("valida dígitos verificadores", () => {
    expect(isValidCnpj(normalizeCnpj(VALID))).toBe(true);
    expect(isValidCnpj("11222333000182")).toBe(false);
    expect(isValidCnpj("00000000000000")).toBe(false);
    expect(isValidCnpj(null)).toBe(false);
  });
});

function setup(ex: Partial<Extraction> = {}, fail = false) {
  const db = openDb(":memory:");
  const app = buildApp({
    db,
    extract: async () => {
      if (fail) throw new LlmUnavailableError("off");
      return { vendor: "Padaria X", cnpj: VALID, issuedOn: "2026-10-03", total: 42.5, currency: "BRL", category: "alimentacao", ...ex };
    },
  });
  return app;
}
const post = (app: ReturnType<typeof setup>, text: string) =>
  app.inject({ method: "POST", url: "/receipts", payload: { text } });

describe("receipts", () => {
  it("extrai, confere o CNPJ e guarda em centavos", async () => {
    const res = await post(setup(), "NF 123 Padaria X total 42,50");
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ cnpj: "11222333000181", cnpjValid: true, totalCents: 4250, needsReview: false });
  });

  it("marca para revisão quando o CNPJ não bate", async () => {
    const res = await post(setup({ cnpj: "11.222.333/0001-82" }), "NF 124 qualquer texto");
    expect(res.json()).toMatchObject({ cnpjValid: false, needsReview: true });
  });

  it("marca para revisão quando falta a data", async () => {
    expect((await post(setup({ issuedOn: null }), "NF sem data nenhuma")).json().needsReview).toBe(true);
  });

  it("documento em dólar vai para revisão e fora do total em reais", async () => {
    const app = setup({ currency: "USD", cnpj: null });
    const res = await post(app, "Notion invoice total US$ 10.00");
    expect(res.json()).toMatchObject({ currency: "USD", needsReview: true });
    expect((await app.inject({ url: "/summary?month=2026-10" })).json()).toMatchObject({ count: 1, totalCents: 0, foreignCurrency: 1 });
  });

  it("não lança o mesmo documento duas vezes", async () => {
    const app = setup();
    await post(app, "mesmo documento aqui");
    const again = await post(app, "mesmo documento aqui");
    expect(again.json()).toMatchObject({ duplicate: true });
    expect((await app.inject({ url: "/summary?month=2026-10" })).json().count).toBe(1);
  });

  it("resume o mês por categoria e exporta CSV pt-BR", async () => {
    const app = setup();
    await post(app, "recibo um um um um um");
    const sum = (await app.inject({ url: "/summary?month=2026-10" })).json();
    expect(sum).toMatchObject({ count: 1, totalCents: 4250, byCategory: { alimentacao: { count: 1, totalCents: 4250 } } });
    const csv = await app.inject({ url: "/export.csv?month=2026-10" });
    expect(csv.headers["content-type"]).toContain("text/csv");
    expect(csv.body).toContain("2026-10-03;Padaria X;11222333000181;42,50;BRL;alimentacao;não");
  });

  it("valida entrada e mês", async () => {
    const app = setup();
    expect((await app.inject({ method: "POST", url: "/receipts", payload: {} })).statusCode).toBe(400);
    expect((await app.inject({ url: "/summary?month=2026-13" })).statusCode).toBe(400);
  });

  it("503 com o Ollama fora do ar", async () => {
    expect((await post(setup({}, true), "texto qualquer longo")).statusCode).toBe(503);
  });
});
