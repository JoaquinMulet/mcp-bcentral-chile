import { test } from "node:test";
import assert from "node:assert/strict";
import { parsearRespuesta, ErrorDidactico } from "../src/client/bcentral-client.js";

test("parseo de la respuesta BDE: Series/Obs con /OBS y FECHA dd-mm-aaaa", () => {
  const json = JSON.stringify({
    Series: [
      {
        SeriesId: "UF",
        Obs: [
          { "/OBS": { INDEX: 1, FECHA: "01-01-2024", VALOR: 36295.68 } },
          { "/OBS": { INDEX: 2, FECHA: "02-01-2024", VALOR: 36302.36 } },
        ],
      },
      { SeriesId: "TPM", Obs: [{ "/OBS": { INDEX: 1, FECHA: "01-02-2024", VALOR: 8.25 } }] },
    ],
  });
  const r = parsearRespuesta(json);
  assert.equal(r.length, 2);
  assert.equal(r[0].codigo, "UF");
  assert.equal(r[0].observaciones.length, 2);
  assert.deepEqual(r[0].observaciones[0], { fecha: "2024-01-01", valor: 36295.68 });
  assert.equal(r[1].codigo, "TPM");
  assert.equal(r[1].observaciones[0].fecha, "2024-02-01");
});

test("parseo tolerante: obs sin /OBS y valores vacíos", () => {
  const json = JSON.stringify({
    Series: [{ SeriesId: "X", Obs: [{ FECHA: "31/12/2024", VALOR: "" }] }],
  });
  const r = parsearRespuesta(json);
  assert.equal(r[0].observaciones[0].valor, null);
  assert.equal(r[0].observaciones[0].fecha, "2024-12-31");
});

test("errores de la BDE: Errores[] se convierten en mensaje didáctico", () => {
  const json = JSON.stringify({ Errores: [{ Descripcion: "Serie no existe" }] });
  assert.throws(() => parsearRespuesta(json), (e: unknown) => {
    assert.ok(e instanceof ErrorDidactico);
    assert.match((e as Error).message, /Serie no existe/);
    return true;
  });
});

test("respuesta no JSON: error didáctico", () => {
  assert.throws(() => parsearRespuesta("<html>Error Page</html>"), /clave puede estar mal/);
  assert.throws(() => parsearRespuesta("garbage"), /no es JSON/);
});
