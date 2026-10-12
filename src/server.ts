import { buildApp } from "./app.js";
import { config } from "./config.js";
import { openDb } from "./db/index.js";
import { ollamaExtractor } from "./services/extract.js";

const app = buildApp(
  { db: openDb(config.dbPath), extract: ollamaExtractor(config.ollamaUrl, config.ollamaModel) },
  true,
);

app.listen({ port: config.port, host: "127.0.0.1" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
