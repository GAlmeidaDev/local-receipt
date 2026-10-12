import Fastify from "fastify";
import { receiptRoutes, type ReceiptDeps } from "./routes/receipts.js";

export function buildApp(deps: ReceiptDeps, logger = false) {
  const app = Fastify({ logger, bodyLimit: 15 * 1024 * 1024 }); // fotos em base64
  app.get("/health", async () => ({ ok: true }));
  app.register(receiptRoutes(deps));
  return app;
}
