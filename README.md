# 🧾 Local Receipts

> Organize os recibos do seu MEI ou freela sem mandar um centavo (nem um CNPJ) para a nuvem.

Você envia o texto ou a **foto** de um recibo ou nota fiscal. Um modelo **open-weight rodando na sua máquina** (Gemma 3 4B via Ollama) lê o documento e extrai fornecedor, CNPJ, data, valor e categoria. O código **confere o CNPJ** (dígitos verificadores) e marca para revisão tudo que não consegue confirmar. No fim do mês, você tem o resumo por categoria e um CSV que abre direto no Excel brasileiro.

Feito para o Hacktoberfest 2026 Open-Source AI Challenge, tema *Side Hustle*.

## Por que não confiar só no modelo

Um modelo de 4B parâmetros lê bem, mas erra. Por isso o modelo só **sugere** e o código **decide**:

- **CNPJ:** validado com os dígitos verificadores. Inválido ou ausente → `needsReview`.
- **Moeda:** o valor nunca é convertido. Documento em USD/EUR vai para revisão e fica **fora** do total em reais.
- **Data ou valor ausentes** → revisão. O modelo é instruído a usar `null` em vez de inventar.
- **Duplicatas:** o mesmo documento (hash) não é lançado duas vezes.
- **Valores em centavos** (inteiros), sem erro de ponto flutuante.

## Como rodar

Requisitos: Node 20+ e [Ollama](https://ollama.com).

```bash
ollama pull gemma3:4b      # ~3,3 GB, uma vez só
npm install
npm run dev                # http://127.0.0.1:3000
```

### Endpoints

| Endpoint | O que faz |
|---|---|
| `POST /receipts` | `{ "text": "..." }` ou `{ "imageBase64": "..." }`: extrai e salva |
| `GET /receipts?month=2026-10` | Lista os recibos do mês |
| `GET /summary?month=2026-10` | Total e quantidade por categoria, e quantos precisam de revisão |
| `GET /export.csv?month=2026-10` | CSV para Excel (`;`, vírgula decimal, UTF-8 com BOM) |

```bash
curl -X POST localhost:3000/receipts -H 'content-type: application/json' \
  -d '{"text":"PADARIA PAO QUENTE LTDA\nCNPJ: 11.222.333/0001-81\nEmissao: 03/10/2026\nTOTAL R$ 21,50"}'
# {"id":1,"vendor":"PADARIA PAO QUENTE LTDA","cnpjValid":true,"issuedOn":"2026-10-03","totalCents":2150,"currency":"BRL","category":"alimentacao","needsReview":false}

curl 'localhost:3000/export.csv?month=2026-10' -o recibos.csv

# foto
curl -X POST localhost:3000/receipts -H 'content-type: application/json' \
  -d "{\"imageBase64\":\"$(base64 -i cupom.jpg | tr -d '\n')\"}"
```

Erros: `400` entrada inválida, `503` Ollama indisponível ou resposta inválida do modelo.

### Configuração (veja `.env.example`)

`PORT` (3000) · `DB_PATH` (`data/recibos.db`) · `OLLAMA_URL` (`http://localhost:11434`) · `OLLAMA_MODEL` (`gemma3:4b`)

## Por que IA open-weight local?

- **Privacidade:** recibos têm CNPJ, valores e nomes de clientes. Nada disso sai do seu computador.
- **Custo marginal zero:** processar 10 ou 1.000 documentos custa o mesmo, então o preço do produto não depende de tokens.
- **Offline:** funciona sem internet.
- **Sem lock-in:** troque o modelo com `OLLAMA_MODEL` ou ajuste um para notas brasileiras, sem renegociar nada.

## Limitações conhecidas

- Foto de baixa qualidade (torta, sombra, amassada) deve errar mais; teste com imagem nítida apenas.
- Não lê PDF diretamente (converta para imagem ou envie o texto).
- A categoria é uma sugestão do modelo. Revise o que vier marcado.
- Sem login: pensado para uso individual local.

## Testes

`npm test` (9 testes, com o modelo mockado) · `npm run typecheck`

## Licença

[Apache-2.0](LICENSE)
