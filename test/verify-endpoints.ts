/**
 * Verificación contra la API real del Banco Central (requiere BCENTRAL_API_KEY).
 * Uso: setx BCENTRAL_API_KEY <clave>  y luego  npx tsx test/verify-endpoints.ts
 */
import { createServer } from "../src/server.js";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

async function main() {
  const key = process.env.BCENTRAL_API_KEY;
  if (!key) {
    console.error("Falta BCENTRAL_API_KEY en el entorno. Sácala de si3.bcentral.cl y corre: setx BCENTRAL_API_KEY <clave>");
    process.exit(1);
  }
  const handler = createMcpHandler(() => createServer({ BCENTRAL_API_KEY: key }));
  const transport = new StreamableHTTPClientTransport("http://localhost/mcp", {
    fetch: (u, i) => handler.fetch(new Request(u, i)),
  });
  const client = new Client({ name: "verify", version: "1" }, { versionNegotiation: { mode: "auto" } });
  await client.connect(transport);

  let pass = 0;
  let fail = 0;
  const probar = async (nombre: string, args: Record<string, unknown>, chequeo: (sc: any, txt: string) => boolean) => {
    try {
      const r = await client.callTool({ name: "bcentral_serie_datos", arguments: args });
      const txt = String(r.content?.[0]?.text ?? "");
      const sc = (r.structuredContent ?? {}) as any;
      const ok = !r.isError && chequeo(sc, txt);
      if (ok) pass++;
      else fail++;
      console.log(`${ok ? "PASS" : "FAIL"} ${nombre}${r.isError ? " → " + txt.slice(0, 200) : ""}`);
    } catch (e) {
      fail++;
      console.log(`FAIL ${nombre} → ${String((e as Error).message).slice(0, 200)}`);
    }
  };

  await probar("UF rango diario", { timeseries: "UF", first: "2024-01-01", last: "2024-01-05" }, (sc, _t) => {
    const obs = sc?.series?.[0]?.observaciones ?? [];
    return obs.length >= 3 && obs[0].valor > 10000;
  });
  await probar("UF,UTM,TPM juntas", { timeseries: "UF,UTM,TPM", first: "2024-01", last: "2024-03" }, (sc, _t) => {
    return (sc?.series?.length ?? 0) === 3;
  });
  await probar("info serie", (() => {
    // bcentral_serie_info se llama como tool distinta; lo hacemos directo abajo
    return {} as Record<string, unknown>;
  })(), () => false);

  const rInfo = await client.callTool({ name: "bcentral_serie_info", arguments: { timeseries: "UF" } });
  const txtInfo = String(rInfo.content?.[0]?.text ?? "");
  if (!rInfo.isError && /UF/.test(txtInfo)) {
    pass++;
    console.log(`PASS bcentral_serie_info → ${txtInfo.slice(0, 160)}`);
  } else {
    fail++;
    console.log(`FAIL bcentral_serie_info → ${txtInfo.slice(0, 200)}`);
  }

  await probar("serie inexistente da error didáctico", { timeseries: "NO_EXISTE_123" }, () => false);

  console.log(`\nTotal endpoints probados: ${pass + fail}`);
  console.log(`PASS: ${pass} | FAIL: ${fail}`);
  await client.close();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("ERR", e);
  process.exit(1);
});
