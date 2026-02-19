/**
 * Configuración de hoja y grid para impresión.
 * Todo en mm internamente. La UI puede usar mm, cm o pulgadas.
 */

export interface SheetLayout {
  /** Ancho de hoja en mm */
  pageWidthMm: number;
  /** Alto de hoja en mm */
  pageHeightMm: number;
  /** Margen en mm (todos los lados) */
  marginMm: number;
  /** Espacio entre celdas en mm */
  gapMm: number;
  /** Filas del grid */
  rows: number;
  /** Columnas del grid */
  cols: number;
  /** Ancho de cada celda en mm */
  cellWidthMm: number;
  /** Alto de cada celda en mm */
  cellHeightMm: number;
}

export type PagePresetId = "a4" | "letter" | "10x15" | "custom";

export const PAGE_PRESETS: Record<
  Exclude<PagePresetId, "custom">,
  { widthMm: number; heightMm: number; name: string }
> = {
  a4: { widthMm: 210, heightMm: 297, name: "A4 (210×297 mm)" },
  letter: { widthMm: 216, heightMm: 279, name: "Carta (216×279 mm)" },
  "10x15": { widthMm: 100, heightMm: 150, name: "10×15 cm" },
};

export function getCellCount(layout: SheetLayout): number {
  return layout.rows * layout.cols;
}

/** Tamaño total del grid (ancho × alto) en mm */
export function getGridSizeMm(layout: SheetLayout) {
  const w =
    layout.cols * layout.cellWidthMm + (layout.cols - 1) * layout.gapMm;
  const h =
    layout.rows * layout.cellHeightMm + (layout.rows - 1) * layout.gapMm;
  return { widthMm: w, heightMm: h };
}

/** Área útil de la hoja (sin márgenes) en mm */
export function getUsableSize(layout: SheetLayout) {
  return {
    widthMm: layout.pageWidthMm - layout.marginMm * 2,
    heightMm: layout.pageHeightMm - layout.marginMm * 2,
  };
}

export interface LayoutFitResult {
  fits: boolean;
  overflowWidthMm?: number;
  overflowHeightMm?: number;
  usableWidthMm: number;
  usableHeightMm: number;
  gridWidthMm: number;
  gridHeightMm: number;
}

/** Comprueba si el grid cabe en el área útil de la hoja */
export function checkLayoutFits(layout: SheetLayout): LayoutFitResult {
  const { widthMm: usableWidthMm, heightMm: usableHeightMm } =
    getUsableSize(layout);
  const { widthMm: gridWidthMm, heightMm: gridHeightMm } =
    getGridSizeMm(layout);
  const overflowWidthMm = Math.max(0, gridWidthMm - usableWidthMm);
  const overflowHeightMm = Math.max(0, gridHeightMm - usableHeightMm);
  return {
    fits: overflowWidthMm === 0 && overflowHeightMm === 0,
    overflowWidthMm: overflowWidthMm > 0 ? overflowWidthMm : undefined,
    overflowHeightMm: overflowHeightMm > 0 ? overflowHeightMm : undefined,
    usableWidthMm,
    usableHeightMm,
    gridWidthMm,
    gridHeightMm,
  };
}

/** Layout por defecto: A4, margen 10mm, 2×2, celdas calculadas del área útil */
export function getDefaultLayout(): SheetLayout {
  const page = PAGE_PRESETS.a4;
  const marginMm = 10;
  const gapMm = 5;
  const rows = 2;
  const cols = 2;
  const usableW = page.widthMm - marginMm * 2;
  const usableH = page.heightMm - marginMm * 2;
  const totalGapW = (cols - 1) * gapMm;
  const totalGapH = (rows - 1) * gapMm;
  const cellWidthMm = (usableW - totalGapW) / cols;
  const cellHeightMm = (usableH - totalGapH) / rows;
  return {
    pageWidthMm: page.widthMm,
    pageHeightMm: page.heightMm,
    marginMm,
    gapMm,
    rows,
    cols,
    cellWidthMm,
    cellHeightMm,
  };
}

/** Construir SheetLayout desde preset de página + valores en mm (margen, gap, filas, cols, tamaño celda) */
export function buildLayoutFromCustom(params: {
  pageWidthMm: number;
  pageHeightMm: number;
  marginMm: number;
  gapMm: number;
  rows: number;
  cols: number;
  cellWidthMm: number;
  cellHeightMm: number;
}): SheetLayout {
  return { ...params };
}

/** Layout flexible: lista de celdas con posición y tamaño (cada una puede ser horizontal o vertical para maximizar cantidad) */
export interface FlexibleLayout {
  pageWidthMm: number;
  pageHeightMm: number;
  marginMm: number;
  gapMm: number;
  cellRects: CellRect[];
  cellCount: number;
}

export interface CellRect {
  row: number;
  colInRow: number;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
}

/**
 * Empaqueta en la hoja la mayor cantidad de celdas del tamaño indicado.
 * Cada celda puede ir en vertical (cellW×cellH) o horizontal (cellH×cellW).
 * Por fila se elige la orientación que permita meter más celdas.
 */
export function packCellsOnPage(params: {
  pageWidthMm: number;
  pageHeightMm: number;
  marginMm: number;
  gapMm: number;
  cellWidthMm: number;
  cellHeightMm: number;
}): CellRect[] {
  const { pageWidthMm, pageHeightMm, marginMm, gapMm, cellWidthMm, cellHeightMm } = params;
  const usableW = pageWidthMm - marginMm * 2;
  const usableH = pageHeightMm - marginMm * 2;
  const rects: CellRect[] = [];
  let y = marginMm;
  let rowIndex = 0;

  while (true) {
    const remainingH = pageHeightMm - marginMm - y;
    if (remainingH < Math.min(cellHeightMm, cellWidthMm)) break;

    const nPortrait = Math.floor((usableW + gapMm) / (cellWidthMm + gapMm));
    const nLandscape = Math.floor((usableW + gapMm) / (cellHeightMm + gapMm));
    const fitPortrait = remainingH >= cellHeightMm && nPortrait > 0;
    const fitLandscape = remainingH >= cellWidthMm && nLandscape > 0;

    let n: number;
    let cellW: number;
    let cellH: number;
    let rowHeight: number;

    if (fitPortrait && fitLandscape) {
      if (nPortrait >= nLandscape) {
        n = nPortrait;
        cellW = cellWidthMm;
        cellH = cellHeightMm;
        rowHeight = cellHeightMm;
      } else {
        n = nLandscape;
        cellW = cellHeightMm;
        cellH = cellWidthMm;
        rowHeight = cellWidthMm;
      }
    } else if (fitPortrait) {
      n = nPortrait;
      cellW = cellWidthMm;
      cellH = cellHeightMm;
      rowHeight = cellHeightMm;
    } else if (fitLandscape) {
      n = nLandscape;
      cellW = cellHeightMm;
      cellH = cellWidthMm;
      rowHeight = cellWidthMm;
    } else {
      break;
    }

    for (let col = 0; col < n; col++) {
      const xMm = marginMm + col * (cellW + gapMm);
      rects.push({
        row: rowIndex,
        colInRow: col,
        xMm,
        yMm: y,
        widthMm: cellW,
        heightMm: cellH,
      });
    }

    y += rowHeight + gapMm;
    rowIndex += 1;
  }

  return rects;
}

/** Construir layout flexible: empaqueta la mayor cantidad de fotos del tamaño indicado (algunas en horizontal, otras en vertical) */
export function buildFlexibleLayout(params: {
  pageWidthMm: number;
  pageHeightMm: number;
  marginMm: number;
  gapMm: number;
  cellWidthMm: number;
  cellHeightMm: number;
}): FlexibleLayout {
  const cellRects = packCellsOnPage(params);
  return {
    pageWidthMm: params.pageWidthMm,
    pageHeightMm: params.pageHeightMm,
    marginMm: params.marginMm,
    gapMm: params.gapMm,
    cellRects,
    cellCount: cellRects.length,
  };
}

/** Obtener posición y tamaño de una celda en layout flexible */
export function getFlexibleCellRect(
  layout: FlexibleLayout,
  cellIndex: number
): CellRect | null {
  return layout.cellRects[cellIndex] ?? null;
}

/** Comprobar si el layout flexible cabe (si hay al menos una celda, el empaquetado ya respeta la hoja) */
export function checkFlexibleLayoutFits(
  layout: FlexibleLayout
): LayoutFitResult {
  const usableWidthMm = layout.pageWidthMm - layout.marginMm * 2;
  const usableHeightMm = layout.pageHeightMm - layout.marginMm * 2;
  if (layout.cellRects.length === 0) {
    return {
      fits: false,
      usableWidthMm,
      usableHeightMm,
      gridWidthMm: 0,
      gridHeightMm: 0,
    };
  }
  const last = layout.cellRects[layout.cellRects.length - 1];
  const gridWidthMm = Math.max(...layout.cellRects.map((r) => r.xMm + r.widthMm)) - layout.marginMm;
  const gridHeightMm = last.yMm + last.heightMm - layout.marginMm;
  const overflowWidthMm = Math.max(0, gridWidthMm - usableWidthMm);
  const overflowHeightMm = Math.max(0, gridHeightMm - usableHeightMm);
  return {
    fits: overflowWidthMm === 0 && overflowHeightMm === 0,
    overflowWidthMm: overflowWidthMm > 0 ? overflowWidthMm : undefined,
    overflowHeightMm: overflowHeightMm > 0 ? overflowHeightMm : undefined,
    usableWidthMm,
    usableHeightMm,
    gridWidthMm,
    gridHeightMm,
  };
}
