import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import type { BcentralEnv } from "../client/bcentral-client.js";
import { ErrorDidactico } from "../client/bcentral-client.js";
import { consultarSeries, infoSeries } from "../client/bcentral-client.js";
import { SERIES_POPULARES } from "../catalogo-series.js";
import { fromError, toolOk } from "../util/errors.js";

const RE_SERIE = /^[A-Za-z0-9_.:-]{1,30}$/;

function validarSeries(value: string, max: number): string[] {
  const codes = value
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  if (codes.length === 0) {
    throw new ErrorDidactico("Indica al menos un código de serie (ej: UF, USD). Puedes ver el catálogo con bcentral_series_populares.");
  }
  for (const c of codes) {
    if (!RE_SERIE.test(c)) {
      throw new ErrorDidactico(`Código de serie inválido: "${c}". Los códigos son alfanuméricos (ej: UF, USD, TPM).`);
    }
  }
  if (codes.length > max) {
    throw new ErrorDidactico(`Máximo ${max} series por consulta (pediste ${codes.length}). Divide en varias llamadas.`);
  }
  return codes;
}

const RE_PERIODO = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/;
function validarPeriodo(v: string, nombre: string): string {
  const m = RE_PERIODO.exec(v);
  if (!m) {
    throw new ErrorDidactico(
      `Parámetro ${nombre} inválido: "${v}". Usa el formato de frecuencia de la serie: AAAA (anual), AAAA-MM (mensual) o AAAA-MM-DD (diaria).`,
    );
  }
  if (m[2] && (Number(m[2]) < 1 || Number(m[2]) > 12)) {
    throw new ErrorDidactico(`Parámetro ${nombre} inválido: mes ${m[2]} fuera de rango (01-12).`);
  }
  if (m[3] && (Number(m[3]) < 1 || Number(m[3]) > 31)) {
    throw new ErrorDidactico(`Parámetro ${nombre} inválido: día ${m[3]} fuera de rango (01-31).`);
  }
  return v;
}

function tablaMarkdown(series: { codigo: string; descripcion: string | null; observaciones: { fecha: string; valor: number | null }[] }[]): string {
  return series
    .map((s) => {
      const enc = s.descripcion ? `**${s.codigo}** — ${s.descripcion}` : `**${s.codigo}**`;
      if (s.observaciones.length === 0) return `${enc}\n(sin observaciones en el rango pedido: prueba otro first/last o verifica el código con bcentral_serie_info)`;
      const filas = s.observaciones.map((o) => `| ${o.fecha} | ${o.valor === null ? "—" : o.valor.toLocaleString("es-CL")} |`).join("\n");
      return `${enc}\n| Fecha | Valor |\n| --- | --- |\n${filas}`;
    })
    .join("\n");
}

export function registrarToolsSeries(server: McpServer, env: BcentralEnv): void {
  server.registerTool(
    "bcentral_serie_datos",
    {
      annotations: { readOnlyHint: true, destructiveHint: false },
      title: "Datos de series económicas del Banco Central (UF, UTM, IPC, TPM, tipo de cambio…)",
      description:
        "Observaciones de una o más series de la Base de Datos Estadísticos del Banco Central de Chile (BDE/SIETE), en un rango de períodos. Requiere la clave privada gratuita BCENTRAL_API_KEY configurada en el servidor. Hasta 30 series por llamada.",
      inputSchema: z.object({
        timeseries: z
          .string()
          .describe("Códigos de serie separados por coma (máx 30). Ej: 'UF' o 'UF,USD,TPM'. Catálogo: bcentral_series_populares y si3.bcentral.cl/Siete"),
        first: z
          .string()
          .optional()
          .describe("Período inicial según la frecuencia: AAAA (anual), AAAA-MM (mensual) o AAAA-MM-DD (diaria). Ej: 2024 o 2024-01 o 2024-01-15"),
        last: z
          .string()
          .optional()
          .describe("Período final (mismo formato que first). Ej: 2024 o 2024-12 o 2024-12-31"),
        lang: z.enum(["es", "en"]).optional().describe("Idioma de las descripciones (es por defecto)"),
      }),
      outputSchema: z.object({
        series: z.array(
          z.object({
            codigo: z.string(),
            descripcion: z.string().nullable(),
            observaciones: z.array(z.object({ fecha: z.string(), valor: z.number().nullable() })),
          }),
        ),
      }),
    },
    async ({ timeseries, first, last, lang }) => {
      try {
        const codes = validarSeries(timeseries, 30);
        const series = await consultarSeries(
          env,
          codes,
          first ? validarPeriodo(first, "first") : undefined,
          last ? validarPeriodo(last, "last") : undefined,
          lang ?? "es",
        );
        return toolOk(
          tablaMarkdown(series),
          {
            series: series.map((s) => ({
              codigo: s.codigo,
              descripcion: s.descripcion,
              observaciones: s.observaciones.map((o) => ({ fecha: o.fecha, valor: o.valor })),
            })),
          },
        );
      } catch (e) {
        return fromError(e);
      }
    },
  );

  server.registerTool(
    "bcentral_serie_info",
    {
      annotations: { readOnlyHint: true, destructiveHint: false },
      title: "Metadatos de series BDE (descripción, frecuencia, unidad)",
      description:
        "Metadatos oficiales de una o más series de la BDE: descripción, frecuencia y unidad. Útil para verificar que un código existe y qué representa antes de pedir datos.",
      inputSchema: z.object({
        timeseries: z.string().describe("Códigos de serie separados por coma (máx 30). Ej: 'UF,USD'"),
        lang: z.enum(["es", "en"]).optional(),
      }),
      outputSchema: z.object({
        series: z.array(
          z.object({
            codigo: z.string(),
            descripcion: z.string().nullable(),
            observaciones: z.array(z.object({ fecha: z.string(), valor: z.number().nullable() })),
          }),
        ),
      }),
    },
    async ({ timeseries, lang }) => {
      try {
        const codes = validarSeries(timeseries, 30);
        const series = await infoSeries(env, codes, lang ?? "es");
        const md = series
          .map((s) => {
            const obs = s.observaciones[0];
            return `**${s.codigo}**: ${s.descripcion ?? "(sin descripción)"}${obs ? ` — última: ${obs.fecha} = ${obs.valor}` : ""}`;
          })
          .join("\n");
        return toolOk(md, { series });
      } catch (e) {
        return fromError(e);
      }
    },
  );

  server.registerTool(
    "bcentral_series_populares",
    {
      annotations: { readOnlyHint: true, destructiveHint: false },
      title: "Catálogo de series populares del Banco Central",
      description:
        "Catálogo local (sin red ni clave) de las series más usadas de la BDE: UF, UTM, IPC, TPM, tipo de cambio, IMACEC, PIB, desempleo. El catálogo completo se busca en si3.bcentral.cl/Siete; verifica cualquier código con bcentral_serie_info.",
      inputSchema: z.object({}),
      outputSchema: z.object({
        series: z.array(z.object({ codigo: z.string(), descripcion: z.string() })),
      }),
    },
    async () => {
      const md = SERIES_POPULARES.map((s) => `- ${s.codigo}: ${s.descripcion}`).join("\n");
      return toolOk(`Series populares de la BDE (verifica cada código con bcentral_serie_info antes de usarlo):\n${md}`, {
        series: SERIES_POPULARES,
      });
    },
  );
}
