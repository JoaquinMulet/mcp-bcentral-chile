/**
 * Catálogo de series más usadas de la BDE del Banco Central (SIETE).
 * Los códigos de serie cambian; verifica con bcentral_serie_info antes de confiar.
 * El catálogo completo se busca en https://si3.bcentral.cl/Siete/es/Siete/Series
 */
export const SERIES_POPULARES: { codigo: string; descripcion: string }[] = [
  { codigo: "UF", descripcion: "Unidad de Fomento (valor diario)" },
  { codigo: "UTM", descripcion: "Unidad Tributaria Mensual" },
  { codigo: "USD", descripcion: "Tipo de cambio observado dólar (CLP por USD)" },
  { codigo: "EUR", descripcion: "Tipo de cambio observado euro (CLP por EUR)" },
  { codigo: "IPC", descripcion: "Índice de Precios al Consumidor (variación)" },
  { codigo: "TPM", descripcion: "Tasa de Política Monetaria" },
  { codigo: "IMACEC", descripcion: "Indicador Mensual de Actividad Económica" },
  { codigo: "PIB", descripcion: "Producto Interno Bruto" },
  { codigo: "DESEMPLEO", descripcion: "Tasa de desempleo" },
  { codigo: "TASA_DE_DESEMPLEO", descripcion: "Tasa de desempleo (variante INE)" },
  { codigo: "LIBRA", descripcion: "Tipo de cambio observado libra esterlina" },
  { codigo: "YEN", descripcion: "Tipo de cambio observado yen japonés" },
];
