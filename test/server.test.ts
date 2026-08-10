import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../src/server.js";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

async function clientCon(env: Record<string, unknown> = {}) {
  const handler = createMcpHandler(() => createServer(env));
  const transport = new StreamableHTTPClientTransport("http://localhost/mcp", {
    fetch: (u, i) => handler.fetch(new Request(u, i)),
  });
  const client = new Client({ name: "t", version: "1" }, { versionNegotiation: { mode: "auto" } });
  await client.connect(transport);
  return client;
}

test("tools/list registra las 3 tools de series", async () => {
  const c = await clientCon();
  const r = await c.listTools();
  const nombres = r.tools.map((t) => t.name);
  assert.ok(nombres.includes("bcentral_serie_datos"), nombres.join(","));
  assert.ok(nombres.includes("bcentral_serie_info"), nombres.join(","));
  assert.ok(nombres.includes("bcentral_series_populares"), nombres.join(","));
  await c.close();
});

test("bcentral_series_populares: catálogo sin red ni clave", async () => {
  const c = await clientCon();
  const r = await c.callTool({ name: "bcentral_series_populares", arguments: {} });
  const sc = r.structuredContent as { series: { codigo: string }[] };
  assert.ok(sc.series.length >= 10);
  assert.ok(sc.series.some((s) => s.codigo === "UF"));
  assert.match(String(r.content?.[0]?.text ?? ""), /UF/);
  await c.close();
});

test("validación: serie inválida da error didáctico (no llega a la red)", async () => {
  const c = await clientCon({ BCENTRAL_API_KEY: "x" });
  const r = await c.callTool({ name: "bcentral_serie_datos", arguments: { timeseries: "U F;UF" } });
  assert.equal(r.isError, true);
  assert.match(String(r.content?.[0]?.text ?? ""), /inválido/);
  await c.close();
});

test("validación: más de 30 series da error", async () => {
  const c = await clientCon({ BCENTRAL_API_KEY: "x" });
  const codes = Array.from({ length: 31 }, (_, i) => `S${i}`).join(",");
  const r = await c.callTool({ name: "bcentral_serie_datos", arguments: { timeseries: codes } });
  assert.equal(r.isError, true);
  assert.match(String(r.content?.[0]?.text ?? ""), /Máximo 30/);
  await c.close();
});

test("sin clave: el error enseña a obtenerla", async () => {
  const c = await clientCon({});
  const r = await c.callTool({ name: "bcentral_serie_datos", arguments: { timeseries: "UF" } });
  assert.equal(r.isError, true);
  const txt = String(r.content?.[0]?.text ?? "");
  assert.match(txt, /BCENTRAL_API_KEY/);
  assert.match(txt, /si3\.bcentral\.cl/);
  await c.close();
});

test("validación: first/last con formato inválido", async () => {
  const c = await clientCon({ BCENTRAL_API_KEY: "x" });
  const r = await c.callTool({ name: "bcentral_serie_datos", arguments: { timeseries: "UF", first: "2024-13-45" } });
  assert.equal(r.isError, true);
  assert.match(String(r.content?.[0]?.text ?? ""), /inválido|fuera de rango/);
  await c.close();
});
