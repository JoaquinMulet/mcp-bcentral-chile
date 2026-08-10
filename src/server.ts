import { McpServer } from "@modelcontextprotocol/server";
import type { BcentralEnv } from "./client/bcentral-client.js";
import { registrarToolsSeries } from "./tools/series.js";

/**
 * Factory per-request: crea un McpServer fresco con todas las tools.
 * Los caches y rate limiters viven en módulos (singletons), no aquí.
 */
export function createServer(env: BcentralEnv = {}): McpServer {
  const server = new McpServer(
    {
      name: "mcp-bcentral-chile",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
      cacheHints: {
        "tools/list": { ttlMs: 600_000, cacheScope: "public" },
        "server/discover": { ttlMs: 600_000, cacheScope: "public" },
      },
      instructions: [
        "Servidor MCP con los datos de la Base de Datos Estadísticos del Banco Central de Chile (BDE/SIETE).",
        "Uso recomendado:",
        "1. Para saber qué códigos existen: bcentral_series_populares (catálogo local) y bcentral_serie_info (descripción oficial de cada código).",
        "2. Para datos: bcentral_serie_datos con timeseries (varios códigos separados por coma, máx 30) y el rango first/last en el formato de frecuencia de la serie: AAAA (anual), AAAA-MM (mensual) o AAAA-MM-DD (diaria).",
        "3. Si una serie devuelve sin observaciones, prueba otro rango o verifica el código con bcentral_serie_info.",
        "Nota: las series más pedidas (UF, UTM, USD, IPC, TPM, IMACEC…) están en bcentral_series_populares; el catálogo completo se busca en si3.bcentral.cl/Siete/es/Siete/Series.",
      ].join("\n"),
    },
  );

  registrarToolsSeries(server, env);

  return server;
}
