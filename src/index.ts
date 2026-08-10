#!/usr/bin/env node
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createServer } from "./server.js";

/**
 * Entrypoint local (STDIO): `node dist/index.js` o bin `mcp-bcentral-chile`.
 * Nunca escribir a stdout (corrompe el protocolo) — usar console.error.
 */
const env = {
  BCENTRAL_API_KEY: process.env.BCENTRAL_API_KEY,
  BCENTRAL_HTTP_TOKEN: process.env.BCENTRAL_HTTP_TOKEN,
  BCENTRAL_RATE_LIMIT_MS: process.env.BCENTRAL_RATE_LIMIT_MS,
  BCENTRAL_CACHE_TTL_S: process.env.BCENTRAL_CACHE_TTL_S,
  BCENTRAL_MAX_SERIES: process.env.BCENTRAL_MAX_SERIES,
  BCENTRAL_UPSTREAM_TIMEOUT_MS: process.env.BCENTRAL_UPSTREAM_TIMEOUT_MS,
};

serveStdio(() => createServer(env));
console.error(
  process.env.BCENTRAL_API_KEY
    ? "mcp-bcentral-chile server corriendo (STDIO) — datos del Banco Central de Chile (BDE)"
    : "mcp-bcentral-chile server corriendo (STDIO) — falta BCENTRAL_API_KEY en el entorno (la obtienes gratis en si3.bcentral.cl)",
);
