/**
 * Presets de grid para impresión.
 * Cada celda es un rectángulo en la grilla (filas x columnas).
 * Las dimensiones de hoja están en mm (ej: A4 = 210x297).
 */

export type GridPresetId = string;

export interface GridPreset {
  id: GridPresetId;
  name: string;
  description?: string;
  /** Filas del grid */
  rows: number;
  /** Columnas del grid */
  cols: number;
  /** Margen en mm (todos los lados) */
  marginMm: number;
  /** Espacio entre celdas en mm */
  gapMm: number;
  /** Ancho de hoja en mm (ej: 210 para A4) */
  pageWidthMm: number;
  /** Alto de hoja en mm (ej: 297 para A4) */
  pageHeightMm: number;
}

export const GRID_PRESETS: GridPreset[] = [
  {
    id: "a4-2x2",
    name: "A4 - 2×2",
    description: "4 fotos en A4",
    rows: 2,
    cols: 2,
    marginMm: 10,
    gapMm: 5,
    pageWidthMm: 210,
    pageHeightMm: 297,
  },
  {
    id: "a4-3x3",
    name: "A4 - 3×3",
    description: "9 fotos en A4",
    rows: 3,
    cols: 3,
    marginMm: 8,
    gapMm: 4,
    pageWidthMm: 210,
    pageHeightMm: 297,
  },
  {
    id: "a4-2x3",
    name: "A4 - 2×3",
    description: "6 fotos en A4",
    rows: 2,
    cols: 3,
    marginMm: 10,
    gapMm: 5,
    pageWidthMm: 210,
    pageHeightMm: 297,
  },
  {
    id: "a4-4x4",
    name: "A4 - 4×4",
    description: "16 fotos en A4",
    rows: 4,
    cols: 4,
    marginMm: 5,
    gapMm: 3,
    pageWidthMm: 210,
    pageHeightMm: 297,
  },
  {
    id: "a4-1x1",
    name: "A4 - 1 foto",
    description: "1 foto por hoja A4",
    rows: 1,
    cols: 1,
    marginMm: 10,
    gapMm: 0,
    pageWidthMm: 210,
    pageHeightMm: 297,
  },
  {
    id: "10x15-2x2",
    name: "10×15 cm - 2×2",
    description: "4 fotos en hoja 10×15 cm",
    rows: 2,
    cols: 2,
    marginMm: 5,
    gapMm: 3,
    pageWidthMm: 100,
    pageHeightMm: 150,
  },
];

export function getPresetById(id: GridPresetId): GridPreset | undefined {
  return GRID_PRESETS.find((p) => p.id === id);
}

export function getCellCount(preset: GridPreset): number {
  return preset.rows * preset.cols;
}

/** Área útil (sin márgenes) en mm */
export function getUsableSize(preset: GridPreset) {
  const w = preset.pageWidthMm - preset.marginMm * 2;
  const h = preset.pageHeightMm - preset.marginMm * 2;
  return { widthMm: w, heightMm: h };
}

/** Tamaño de cada celda en mm */
export function getCellSizeMm(preset: GridPreset) {
  const { widthMm, heightMm } = getUsableSize(preset);
  const totalGapW = (preset.cols - 1) * preset.gapMm;
  const totalGapH = (preset.rows - 1) * preset.gapMm;
  const cellW = (widthMm - totalGapW) / preset.cols;
  const cellH = (heightMm - totalGapH) / preset.rows;
  return { widthMm: cellW, heightMm: cellH };
}
