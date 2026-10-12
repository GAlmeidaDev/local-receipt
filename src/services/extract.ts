import { z } from "zod";

export const CATEGORIES = [
  "alimentacao", "transporte", "software_e_assinaturas", "equipamento",
  "marketing", "impostos_e_taxas", "servicos_profissionais", "outros",
] as const;

export const ExtractionSchema = z.object({
  vendor: z.string().min(1).max(120),
  cnpj: z.string().nullable(),
  issuedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  total: z.number().nonnegative(), // na moeda do documento
  currency: z.enum(["BRL", "USD", "EUR", "other"]),
  category: z.enum(CATEGORIES),
});
export type Extraction = z.infer<typeof ExtractionSchema>;

export type ReceiptInput = { text: string } | { imageBase64: string };
export type Extractor = (input: ReceiptInput) => Promise<Extraction>;

export class LlmUnavailableError extends Error {}

const SYSTEM = `Você extrai dados de recibos e notas fiscais brasileiras.
Responda apenas JSON com: vendor (nome do emitente), cnpj (do emitente, ou null se não aparecer),
issuedOn (data de emissão em YYYY-MM-DD, ou null), total (valor total pago, número com ponto decimal, SEM converter moeda),
currency (BRL para R$, USD para US$ ou $, EUR para €, other nas demais) e category, uma de: ${CATEGORIES.join(", ")}.
Guia de categorias: combustível, gasolina, estacionamento, pedágio, Uber e passagens = transporte; restaurante, padaria e mercado = alimentacao;
Notion, Figma, hospedagem, domínio, SaaS = software_e_assinaturas; notebook, monitor, periféricos = equipamento; anúncios = marketing;
DAS, taxas e tarifas = impostos_e_taxas; contador, advogado, designer = servicos_profissionais.
Não invente: se um dado não estiver no documento, use null. Datas brasileiras são dia/mês/ano.`;

export function ollamaExtractor(baseUrl: string, model: string): Extractor {
  return async (input) => {
    const user =
      "text" in input
        ? { role: "user", content: `Documento:\n${input.text}` }
        : { role: "user", content: "Extraia os dados deste recibo.", images: [input.imageBase64] };

    let res: Response;
    try {
      res = await fetch(new URL("/api/chat", baseUrl), {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: AbortSignal.timeout(180_000),
        body: JSON.stringify({
          model,
          stream: false,
          format: z.toJSONSchema(ExtractionSchema),
          options: { temperature: 0 },
          messages: [{ role: "system", content: SYSTEM }, user],
        }),
      });
    } catch (err) {
      throw new LlmUnavailableError(`Não consegui falar com o Ollama em ${baseUrl}: ${(err as Error).message}`);
    }
    if (!res.ok) throw new LlmUnavailableError(`Ollama respondeu ${res.status}: ${await res.text()}`);

    const body = (await res.json()) as { message?: { content?: string } };
    try {
      return ExtractionSchema.parse(JSON.parse(body.message?.content ?? ""));
    } catch {
      throw new LlmUnavailableError("O modelo devolveu uma resposta inválida; tente de novo.");
    }
  };
}
