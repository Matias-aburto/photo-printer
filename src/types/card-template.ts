import type { LengthUnit } from "@/lib/units";

/**
 * Plantilla de "card" para el Grid Maker.
 * Define el marco (tamaño de la celda) y uno o más placeholders donde van las fotos.
 * El placeholder usa márgenes (desde el borde del marco) y padding (dentro del área de foto).
 */

export interface PlaceholderRect {
  /** Margen desde el borde del marco (mm) */
  marginTopMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
  marginRightMm: number;
  /** Padding dentro del área de foto (mm) */
  paddingTopMm: number;
  paddingBottomMm: number;
  paddingLeftMm: number;
  paddingRightMm: number;
}

/** Formato legacy (x, y, width, height) para migración */
export interface PlaceholderRectLegacy {
  xMm?: number;
  yMm?: number;
  widthMm?: number;
  heightMm?: number;
  marginTopMm?: number;
  marginBottomMm?: number;
  marginLeftMm?: number;
  marginRightMm?: number;
  paddingTopMm?: number;
  paddingBottomMm?: number;
  paddingLeftMm?: number;
  paddingRightMm?: number;
}

/** Devuelve el rect de la imagen (donde va la foto) en mm, dados el placeholder y el tamaño del marco. */
export function getPlaceholderImageRect(
  ph: PlaceholderRect,
  cardWidthMm: number,
  cardHeightMm: number
): { xMm: number; yMm: number; widthMm: number; heightMm: number } {
  const outerW = cardWidthMm - ph.marginLeftMm - ph.marginRightMm;
  const outerH = cardHeightMm - ph.marginTopMm - ph.marginBottomMm;
  return {
    xMm: ph.marginLeftMm + ph.paddingLeftMm,
    yMm: ph.marginTopMm + ph.paddingTopMm,
    widthMm: Math.max(0, outerW - ph.paddingLeftMm - ph.paddingRightMm),
    heightMm: Math.max(0, outerH - ph.paddingTopMm - ph.paddingBottomMm),
  };
}

/** Placeholder con márgenes/padding rotados 90° CW (para card en horizontal). */
function rotatePlaceholder90(ph: PlaceholderRect): PlaceholderRect {
  return {
    marginTopMm: ph.marginRightMm,
    marginBottomMm: ph.marginLeftMm,
    marginLeftMm: ph.marginTopMm,
    marginRightMm: ph.marginBottomMm,
    paddingTopMm: ph.paddingRightMm,
    paddingBottomMm: ph.paddingLeftMm,
    paddingLeftMm: ph.paddingTopMm,
    paddingRightMm: ph.paddingBottomMm,
  };
}

/** Devuelve el rect de la imagen cuando la card está rotada 90° (marco físico = cardHeightMm × cardWidthMm). */
export function getPlaceholderImageRectRotated(
  ph: PlaceholderRect,
  cardWidthMm: number,
  cardHeightMm: number
): { xMm: number; yMm: number; widthMm: number; heightMm: number } {
  return getPlaceholderImageRect(rotatePlaceholder90(ph), cardHeightMm, cardWidthMm);
}

/** Normaliza un placeholder (legacy o nuevo) al formato actual. */
export function normalizePlaceholder(
  ph: PlaceholderRect | PlaceholderRectLegacy,
  cardWidthMm: number,
  cardHeightMm: number
): PlaceholderRect {
  const p = ph as PlaceholderRectLegacy;
  if (
    p.marginTopMm != null &&
    p.marginBottomMm != null &&
    p.marginLeftMm != null &&
    p.marginRightMm != null
  ) {
    return {
      marginTopMm: p.marginTopMm,
      marginBottomMm: p.marginBottomMm,
      marginLeftMm: p.marginLeftMm,
      marginRightMm: p.marginRightMm,
      paddingTopMm: p.paddingTopMm ?? 0,
      paddingBottomMm: p.paddingBottomMm ?? 0,
      paddingLeftMm: p.paddingLeftMm ?? 0,
      paddingRightMm: p.paddingRightMm ?? 0,
    };
  }
  if (p.xMm != null && p.yMm != null && p.widthMm != null && p.heightMm != null) {
    return {
      marginTopMm: p.yMm,
      marginBottomMm: cardHeightMm - p.yMm - p.heightMm,
      marginLeftMm: p.xMm,
      marginRightMm: cardWidthMm - p.xMm - p.widthMm,
      paddingTopMm: 0,
      paddingBottomMm: 0,
      paddingLeftMm: 0,
      paddingRightMm: 0,
    };
  }
  return {
    marginTopMm: 5,
    marginBottomMm: 5,
    marginLeftMm: 5,
    marginRightMm: 5,
    paddingTopMm: 0,
    paddingBottomMm: 0,
    paddingLeftMm: 0,
    paddingRightMm: 0,
  };
}

export type TemplateBorderStyle = "solid" | "dashed";

export interface TemplateBorder {
  enabled: boolean;
  style: TemplateBorderStyle;
  widthMm: number;
}

export interface CardTemplate {
  id: string;
  name: string;
  /** Ancho del marco (card) en mm */
  widthMm: number;
  /** Alto del marco (card) en mm */
  heightMm: number;
  /** Espacio entre celdas en la hoja (mm). Opcional; si no se define, el editor usa un valor por defecto. */
  gapMm?: number;
  /** Zonas donde va la foto; típicamente uno por card */
  placeholders: PlaceholderRect[];
  /** Borde del marco (exterior de la card). Por defecto desactivado. */
  outerBorder?: TemplateBorder;
  /** Borde del área de foto (interior). Por defecto desactivado. */
  innerBorder?: TemplateBorder;
  /** Unidad preferida para ancho/alto del marco en el editor (mm, cm, in). */
  frameUnit?: LengthUnit;
  /** Unidad preferida para márgenes/tamaño del placeholder en el editor. */
  placeholderUnit?: LengthUnit;
  /** Unidad preferida para el gap entre cards en el editor. */
  gapUnit?: LengthUnit;
}

export function isCardTemplate(t: unknown): t is CardTemplate {
  return (
    typeof t === "object" &&
    t !== null &&
    "id" in t &&
    "name" in t &&
    "widthMm" in t &&
    "heightMm" in t &&
    Array.isArray((t as CardTemplate).placeholders)
  );
}
