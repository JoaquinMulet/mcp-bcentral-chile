/**
 * Cliente de la API pública del Banco Central de Chile (Base de Datos Estadísticos,
 * sistema SIETE): https://si3.bcentral.cl/Siete/es/Siete/API
 *
 * El servicio requiere una clave privada gratuita (Registrarse en si3.bcentral.cl).
 * Se envía como parámetro `auth` de la URL, igual que el resto de parámetros.
 * Límites oficiales: máximo 30 series por consulta; los períodos se expresan en
 * el formato de frecuencia de cada serie (AAAA, AAAA-MM o AAAA-MM-DD).
 */

/** Entorno del servidor (Workers env o variables de entorno en STDIO). */
export interface BcentralEnv {
  /** Clave privada gratuita de la API BDE (obligatoria; en Workers: wrangler secret put BCENTRAL_API_KEY) */
  BCENTRAL_API_KEY?: string;
  /** Opcional: si está definida, el MCP exige Authorization: Bearer <token> */
  BCENTRAL_HTTP_TOKEN?: string;
  BCENTRAL_KV?: { get: (k: string) => Promise<string | null>; put: (k: string, v: string, o?: { expirationTtl?: number }) => Promise<void> };
  BCENTRAL_RATE_LIMIT_MS?: string;
  BCENTRAL_CACHE_TTL_S?: string;
  BCENTRAL_MAX_SERIES?: string;
  BCENTRAL_UPSTREAM_TIMEOUT_MS?: string;
}

export const HOST_BCENTRAL = "si3.bcentral.cl";
export const HOSTS_ALLOWLIST = new Set([HOST_BCENTRAL]);

const configDefault = {
  rateLimitMs: 500,
  cacheTtlS: 900,
  maxSeries: 30,
  upstreamTimeoutMs: 12000,
};

export function config(env: BcentralEnv) {
  return {
    rateLimitMs: env.BCENTRAL_RATE_LIMIT_MS ? parseInt(env.BCENTRAL_RATE_LIMIT_MS, 10) : configDefault.rateLimitMs,
    cacheTtlS: env.BCENTRAL_CACHE_TTL_S ? parseInt(env.BCENTRAL_CACHE_TTL_S, 10) : configDefault.cacheTtlS,
    maxSeries: env.BCENTRAL_MAX_SERIES ? parseInt(env.BCENTRAL_MAX_SERIES, 10) : configDefault.maxSeries,
    upstreamTimeoutMs: env.BCENTRAL_UPSTREAM_TIMEOUT_MS
      ? parseInt(env.BCENTRAL_UPSTREAM_TIMEOUT_MS, 10)
      : configDefault.upstreamTimeoutMs,
  };
}

export class ErrorDidactico extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "ErrorDidactico";
  }
}

function apiKey(env: BcentralEnv): string {
  const k = env.BCENTRAL_API_KEY?.trim();
  if (!k) {
    throw new ErrorDidactico(
      "El servidor no tiene configurada la clave privada del API del Banco Central (BCENTRAL_API_KEY). " +
        "Paso a paso: (1) regístrate con usuario y contraseña en https://si3.bcentral.cl/Siete/es/Siete/API (sección Registrarse); " +
        "(2) inicia sesión — las credenciales del API se activan al entrar; " +
        "(3) dentro del portal, copia tu CLAVE PRIVADA (la cadena alfanumérica de tu perfil/API — no es tu contraseña) y " +
        "cárgala en el Worker con: wrangler secret put BCENTRAL_API_KEY",
    );
  }
  return k;
}

/** Rate limiter por host (singleton de módulo): cola con timeout y max in-flight. */
class RateLimiter {
  private ultimo = new Map<string, number>();
  private inflight = 0;
  constructor(private minMs: number, private maxInflight = 4) {}

  async esperar(host: string): Promise<void> {
    while (this.inflight >= this.maxInflight) {
      await new Promise((r) => setTimeout(r, 100));
    }
    const ultimo = this.ultimo.get(host) ?? 0;
    const falta = ultimo + this.minMs - Date.now();
    if (falta > 0) await new Promise((r) => setTimeout(r, falta));
    this.ultimo.set(host, Date.now());
    this.inflight++;
  }
  liberar(): void {
    this.inflight--;
  }
}

let limiter: RateLimiter | null = null;
let limiterMs = 0;
function getLimiter(minMs: number): RateLimiter {
  if (!limiter || limiterMs !== minMs) {
    limiter = new RateLimiter(minMs);
    limiterMs = minMs;
  }
  return limiter;
}

const cacheMem = new Map<string, { v: string; t: number }>();

/** GET a la API BDE con auth, rate limit, timeout y cache (memoria + KV opcional). */
export async function getBcentral(
  env: BcentralEnv,
  params: Record<string, string>,
  ttlS?: number,
): Promise<string> {
  const c = config(env);
  const url = new URL(`https://${HOST_BCENTRAL}/SieteRestWS/SieteRestWS.ashx`);
  for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v);
  url.searchParams.set("auth", apiKey(env));
  url.searchParams.set("lang", params.lang ?? "es");

  const ttl = ttlS ?? c.cacheTtlS;
  const cacheKey = url.searchParams.get("timeseries") + "|" + url.searchParams.get("first") + "|" + url.searchParams.get("last") + "|" + url.searchParams.get("function");
  const mem = cacheMem.get(cacheKey);
  if (mem && mem.t + ttl * 1000 > Date.now()) return mem.v;
  if (env.BCENTRAL_KV) {
    const kv = await env.BCENTRAL_KV.get("bcentral:" + cacheKey).catch(() => null);
    if (kv) {
      cacheMem.set(cacheKey, { v: kv, t: Date.now() });
      return kv;
    }
  }

  const lim = getLimiter(c.rateLimitMs);
  await lim.esperar(HOST_BCENTRAL);
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), c.upstreamTimeoutMs);
    const res = await fetch(url.toString(), { signal: ctrl.signal, redirect: "follow" });
    clearTimeout(to);
    const texto = await res.text();
    if (res.status === 302 || !res.ok) {
      if (res.status === 401 || res.status === 403 || /auth|clave/i.test(texto.slice(0, 300))) {
        throw new ErrorDidactico(
          `El Banco Central rechazó la clave (HTTP ${res.status}): verifica que BCENTRAL_API_KEY sea la clave privada de https://si3.bcentral.cl (cámbiala con: wrangler secret put BCENTRAL_API_KEY).`,
        );
      }
      throw new ErrorDidactico(`El Banco Central respondió HTTP ${res.status}. Intenta de nuevo en unos segundos.`);
    }
    if (ttl > 0) {
      cacheMem.set(cacheKey, { v: texto, t: Date.now() });
      if (env.BCENTRAL_KV) env.BCENTRAL_KV.put("bcentral:" + cacheKey, texto, { expirationTtl: ttl }).catch(() => {});
    }
    return texto;
  } finally {
    lim.liberar();
  }
}

export interface ObservacionSerie {
  fecha: string; // YYYY-MM-DD (normalizada)
  valor: number | null;
}

export interface SerieNormalizada {
  codigo: string;
  descripcion: string | null;
  observaciones: ObservacionSerie[];
}

/** Normaliza una observación de la BDE: {"/OBS": {"INDEX":1,"FECHA":"01-01-2024","VALOR":36295.68}} */
function normalizarObs(obs: unknown): ObservacionSerie | null {
  const o = (obs as Record<string, unknown>)?.["/OBS"] ?? obs;
  const r = (o ?? {}) as Record<string, unknown>;
  if (r.FECHA === undefined && r.VALOR === undefined) return null;
  const fecha = String(r.FECHA ?? "").trim();
  // dd-mm-aaaa o dd/mm/aaaa → YYYY-MM-DD
  const m = fecha.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  let iso = fecha;
  if (m) iso = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  let valor: number | null;
  if (typeof r.VALOR === "number") {
    valor = Number.isFinite(r.VALOR as number) ? (r.VALOR as number) : null;
  } else if (r.VALOR === undefined || r.VALOR === null || r.VALOR === "") {
    valor = null;
  } else {
    const n = Number(String(r.VALOR).replace(/\./g, "").replace(",", "."));
    valor = Number.isFinite(n) ? n : null;
  }
  return { fecha: iso, valor };
}

/** Parsea la respuesta JSON de la BDE: {"Series":[{"SeriesId":"UF","Obs":[...]}]} */
export function parsearRespuesta(texto: string): SerieNormalizada[] {
  let j: unknown;
  try {
    j = JSON.parse(texto);
  } catch {
    if (/Error Page|unexpected error/i.test(texto)) {
      throw new ErrorDidactico(
        "El Banco Central devolvió una página de error: la clave puede estar mal o la consulta es inválida. " +
          "Verifica la clave (wrangler secret put BCENTRAL_API_KEY) y que los códigos de serie existan.",
      );
    }
    throw new ErrorDidactico("El Banco Central devolvió una respuesta que no es JSON. Intenta de nuevo.");
  }
  const j2 = j as { Series?: unknown[]; Errores?: unknown[] };
  if (j2.Errores?.length) {
    const descs = j2.Errores.map((e) => String((e as Record<string, unknown>)?.Descripcion ?? JSON.stringify(e))).join("; ");
    throw new ErrorDidactico(`El Banco Central devolvió un error: ${descs}`);
  }
  if (!Array.isArray(j2.Series)) {
    throw new ErrorDidactico("El Banco Central devolvió una respuesta sin series. Revisa los códigos consultados.");
  }
  return j2.Series.map((s) => {
    const serie = (s ?? {}) as Record<string, unknown>;
    const obsRaw = Array.isArray(serie.Obs) ? serie.Obs : [];
    const observaciones = obsRaw
      .map(normalizarObs)
      .filter((o): o is ObservacionSerie => o !== null);
    return {
      codigo: String(serie.SeriesId ?? "?"),
      descripcion: typeof serie.Descripcion === "string" ? serie.Descripcion : null,
      observaciones,
    };
  });
}

/** Consulta una o más series con rango de períodos. */
export async function consultarSeries(
  env: BcentralEnv,
  codes: string[],
  first?: string,
  last?: string,
  lang = "es",
): Promise<SerieNormalizada[]> {
  const c = config(env);
  if (codes.length > c.maxSeries) {
    throw new ErrorDidactico(
      `Máximo ${c.maxSeries} series por consulta (pediste ${codes.length}). Divide la consulta en varias llamadas.`,
    );
  }
  const params: Record<string, string> = {
    timeseries: codes.join(","),
    formato: "json",
    lang,
  };
  if (first) params.first = first;
  if (last) params.last = last;
  const texto = await getBcentral(env, params);
  return parsearRespuesta(texto);
}

/** Metadatos de una o más series (descripción, frecuencia, unidad). */
export async function infoSeries(env: BcentralEnv, codes: string[], lang = "es"): Promise<SerieNormalizada[]> {
  const c = config(env);
  if (codes.length > c.maxSeries) {
    throw new ErrorDidactico(`Máximo ${c.maxSeries} series por consulta (pediste ${codes.length}).`);
  }
  const params: Record<string, string> = {
    timeseries: codes.join(","),
    formato: "json",
    lang,
    function: "GetSeriesInformation",
  };
  const texto = await getBcentral(env, params);
  return parsearRespuesta(texto);
}
