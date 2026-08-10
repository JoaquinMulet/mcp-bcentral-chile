import type { CallToolResult } from "@modelcontextprotocol/server";

/** Resultado de tool estandarizado: error accionable para el modelo. */
export function toolError(mensaje: string): CallToolResult {
  return {
    content: [{ type: "text", text: `ERROR: ${mensaje}` }],
    isError: true,
  };
}

/** Resultado OK estándar: texto resumen + structuredContent JSON. */
export function toolOk(
  texto: string,
  structuredContent: Record<string, unknown>,
  extra: { isError?: boolean } = {},
): CallToolResult {
  return {
    content: [{ type: "text", text: texto }],
    structuredContent,
    ...extra,
  };
}

/** Convierte una excepción de red/parseo en tool execution error. */
export function fromError(e: unknown): CallToolResult {
  const msg = e instanceof Error ? e.message : String(e);
  return toolError(msg);
}
