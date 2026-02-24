/**
 * Guías de alineación para la vista previa y export PDF.
 */

export type GuideOrientation = "horizontal" | "vertical";

export interface Guide {
  id: string;
  orientation: GuideOrientation;
  /** Posición en mm desde el borde superior (horizontal) o izquierdo (vertical) */
  positionMm: number;
}
