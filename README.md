# mcp-bcentral-chile

MCP server para la **Base de Datos Estadísticos (BDE)** del **Banco Central de Chile** (sistema SIETE): UF, UTM, IPC, TPM, tipo de cambio, IMACEC, PIB y miles de series económicas. Libre, gratuito y open-source.

## Qué cubre

- **Series de tiempo** de la API oficial del BCCh (`si3.bcentral.cl/SieteRestWS`): hasta 30 series por consulta, con rango de períodos (AAAA, AAAA-MM o AAAA-MM-DD según la frecuencia).
- **Metadatos oficiales** de cada serie (descripción, frecuencia, unidad) para verificar que un código existe.
- **Catálogo local** de las series más usadas (UF, UTM, USD, EUR, IPC, TPM, IMACEC, PIB, desempleo…).

## Herramientas

| Tool | Qué hace |
| --- | --- |
| `bcentral_serie_datos` | Observaciones de 1 a 30 series en un rango (JSON estructurado + tabla Markdown) |
| `bcentral_serie_info` | Descripción oficial, frecuencia y última observación de una serie |
| `bcentral_series_populares` | Catálogo local de series más usadas (sin red ni clave) |

## Conexión

**Cloudflare (recomendado):**

```
https://bcentral-mcp.kumocloud.cl/mcp
```

Requiere configurar la clave privada gratuita de la API BDE en el Worker:

```bash
npx wrangler secret put BCENTRAL_API_KEY
```

(La clave se obtiene gratis registrándose en <https://si3.bcentral.cl/Siete/es/Siete/API>.)

**Local (STDIO):**

```bash
set BCENTRAL_API_KEY=tu_clave
npm run build
npm start
```

## Ejemplos

- `bcentral_serie_datos` con `timeseries: "UF"`, `first: "2024-01-01"`, `last: "2024-12-31"` → la UF de todo el año.
- `bcentral_serie_datos` con `timeseries: "UF,UTM,IPC,TPM"` → indicadores juntos.
- `bcentral_serie_info` con `timeseries: "IMACEC"` → verificar que el código existe y qué mide.

## Límites y notas

- Máximo 30 series por consulta (límite oficial del BCCh). El error te dice cuándo dividir.
- Los períodos se expresan en el formato de frecuencia de la serie: `2024` (anual), `2024-01` (mensual), `2024-01-15` (diaria).
- Si una serie no devuelve observaciones, verifica el código con `bcentral_serie_info`; el catálogo completo se busca en `si3.bcentral.cl/Siete/es/Siete/Series`.
- El servidor cachea las respuestas 15 minutos y limita el ritmo de consultas para no abusar del BCCh.

## Desarrollar

```bash
npm install
npm test        # tests unitarios sin red
npm run build   # tsc
npm run verify  # verificación contra la API real (requiere BCENTRAL_API_KEY en el entorno)
npm run deploy  # wrangler deploy
```

## Licencia

MIT — los datos pertenecen al Banco Central de Chile; el código de este servidor es libre.
