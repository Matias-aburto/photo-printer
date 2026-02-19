export interface CellPhoto {
  /** URL del blob o data URL de la imagen */
  url: string;
  /** Nombre original del archivo */
  fileName?: string;
  /** Id para sincronizar con la biblioteca (misma foto = mismo id) */
  photoId?: string;
  /** Escala (1 = 100%), editable */
  scale?: number;
  /** Rotación en grados, editable */
  rotation?: number;
  /** Desplazamiento horizontal dentro de la celda (-1 a 1, 0 = centrado) */
  panX?: number;
  /** Desplazamiento vertical dentro de la celda (-1 a 1, 0 = centrado) */
  panY?: number;
}

export const DEFAULT_PHOTO_EDIT = {
  scale: 1,
  rotation: 0,
  panX: 0,
  panY: 0,
} as const;

export function getPhotoEdit(photo: CellPhoto) {
  return {
    scale: photo.scale ?? DEFAULT_PHOTO_EDIT.scale,
    rotation: photo.rotation ?? DEFAULT_PHOTO_EDIT.rotation,
    panX: photo.panX ?? DEFAULT_PHOTO_EDIT.panX,
    panY: photo.panY ?? DEFAULT_PHOTO_EDIT.panY,
  };
}

/** Índice de celda (0..rows*cols-1). null = celda vacía */
export type GridCells = (CellPhoto | null)[];
