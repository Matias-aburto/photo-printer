/** Estilo del borde del grid */
export type GridBorderStyle = "solid" | "dotted";

export interface GridAppearance {
  /** Mostrar bordes en las celdas del grid */
  showBorders: boolean;
  /** Estilo: sólido o punteado */
  borderStyle: GridBorderStyle;
  /** Grosor del borde en mm */
  borderWidthMm: number;
  /** Radio de las esquinas en mm (0 = recto) */
  borderRadiusMm: number;
  /** Padding interno de la celda en mm (espacio entre el borde y la foto) */
  cellPaddingMm: number;
}

export const DEFAULT_GRID_APPEARANCE: GridAppearance = {
  showBorders: false,
  borderStyle: "solid",
  borderWidthMm: 0.1,
  borderRadiusMm: 0,
  cellPaddingMm: 0,
};
