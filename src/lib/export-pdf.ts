/**
 * Exporta el grid de fotos a PDF a 300 DPI para impresión de calidad.
 * Cada celda se renderiza en un canvas (misma lógica que la UI: contain + pan, rotate, scale).
 * Contain mantiene la proporción y calidad original de la imagen dentro de la celda.
 */

import type { SheetLayout, FlexibleLayout } from "./sheet-layout";
import { getFlexibleCellRect } from "./sheet-layout";
import type { GridCells, CellPhoto } from "@/types/photo-grid";
import type { GridAppearance } from "@/types/grid-appearance";
import { getPhotoEdit } from "@/types/photo-grid";

export interface Guide {
  id: string;
  orientation: "horizontal" | "vertical";
  positionMm: number;
}

const DPI = 300;
const MM_PER_INCH = 25.4;
const PX_PER_MM = DPI / MM_PER_INCH;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image: " + url));
    img.src = url;
  });
}

function drawCellBorder(
  doc: import("jspdf").jsPDF,
  x: number,
  y: number,
  cellW: number,
  cellH: number,
  appearance: GridAppearance
) {
  if (!appearance.showBorders) return;
  const w = appearance.borderWidthMm;
  const r = Math.min(appearance.borderRadiusMm, cellW / 2, cellH / 2);
  doc.setLineWidth(w);
  doc.setDrawColor(0, 0, 0);
  if (appearance.borderStyle === "dotted") {
    doc.setLineDashPattern([w * 2, w * 1.5], 0);
  } else {
    doc.setLineDashPattern([], 0);
  }
  if (r > 0) {
    doc.roundedRect(x, y, cellW, cellH, r, r, "S");
  } else {
    doc.rect(x, y, cellW, cellH, "S");
  }
  doc.setLineDashPattern([], 0);
}

/**
 * Dibuja la foto en un canvas con la misma lógica que la UI: contain (mantiene proporción y calidad, imagen completa dentro de la celda), luego pan/rotate/scale.
 * Aplica padding interno si está configurado.
 */
function drawCellToCanvas(
  img: HTMLImageElement,
  photo: CellPhoto,
  cellWPx: number,
  cellHPx: number,
  borderRadiusPx: number,
  cellPaddingPx: number = 0
): HTMLCanvasElement {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  
  const availableWPx = cellWPx - (cellPaddingPx * 2);
  const availableHPx = cellHPx - (cellPaddingPx * 2);
  
  // contain: escala para que la imagen quepa entera manteniendo proporción (sin recortar)
  const containScale = Math.min(availableWPx / iw, availableHPx / ih);
  const drawWPx = iw * containScale;
  const drawHPx = ih * containScale;

  const edit = getPhotoEdit(photo);
  const rotationRad = (edit.rotation * Math.PI) / 180;
  
  const panTx = edit.panX * (availableWPx / 2);
  const panTy = edit.panY * (availableHPx / 2);

  const canvas = document.createElement("canvas");
  canvas.width = cellWPx;
  canvas.height = cellHPx;
  const ctx = canvas.getContext("2d")!;

  // Rellenar todo el canvas con fondo blanco primero (antes de cualquier clip)
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, cellWPx, cellHPx);

  ctx.save();

  // Aplicar clip con borderRadius si es necesario (esto define el área total de la celda)
  if (borderRadiusPx > 0) {
    ctx.beginPath();
    const r = Math.min(borderRadiusPx, cellWPx / 2, cellHPx / 2);
    ctx.moveTo(r, 0);
    ctx.arcTo(cellWPx, 0, cellWPx, r, r);
    ctx.arcTo(cellWPx, cellHPx, cellWPx - r, cellHPx, r);
    ctx.arcTo(0, cellHPx, 0, cellHPx - r, r);
    ctx.arcTo(0, 0, r, 0, r);
    ctx.closePath();
    ctx.clip();
    // Rellenar de nuevo dentro del clip para asegurar que el fondo blanco esté presente
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
  }

  // Guardar el estado antes de aplicar el clip del área disponible
  ctx.save();

  // Crear un clip para el área disponible (después del padding)
  // El rectángulo comienza en (cellPaddingPx, cellPaddingPx) y tiene tamaño (availableWPx, availableHPx)
  // Esto deja espacio para el padding en todos los lados: izquierdo, derecho, superior e inferior
  ctx.beginPath();
  ctx.rect(cellPaddingPx, cellPaddingPx, availableWPx, availableHPx);
  ctx.clip();

  // Ahora el área de dibujo está limitada al rectángulo definido arriba
  // Aplicar padding: mover el origen al inicio del área disponible para la imagen
  ctx.translate(cellPaddingPx, cellPaddingPx);
  
  // Centrar en el área disponible (que ahora tiene tamaño availableWPx x availableHPx)
  ctx.translate(availableWPx / 2, availableHPx / 2);
  ctx.translate(panTx, panTy);
  ctx.rotate(rotationRad);
  ctx.scale(edit.scale, edit.scale);
  // Dibujar la imagen centrada (contain: puede quedar espacio en los bordes)
  ctx.drawImage(
    img,
    0, 0, iw, ih,
    -drawWPx / 2, -drawHPx / 2, drawWPx, drawHPx
  );

  // Restaurar el estado del clip del área disponible
  ctx.restore();
  
  // Restaurar el estado completo (incluyendo el clip del borderRadius)
  ctx.restore();

  return canvas;
}

export async function exportGridToPdf(
  layout: SheetLayout,
  cells: GridCells,
  appearance: GridAppearance,
  sheetCount: number = 1,
  guides: Guide[] = [],
  flexibleLayout: FlexibleLayout | null = null
): Promise<Blob> {
  const { jsPDF } = await import("jspdf");

  const margin = layout.marginMm;
  const gap = layout.gapMm;
  const useFlexible = flexibleLayout != null;
  const cellsPerSheet = useFlexible
    ? flexibleLayout.cellCount
    : layout.rows * layout.cols;
  const borderRadiusPx = appearance.borderRadiusMm * PX_PER_MM;
  const cellPaddingPx = Math.round(appearance.cellPaddingMm * PX_PER_MM);

  const doc = new jsPDF({
    orientation:
      layout.pageWidthMm >= layout.pageHeightMm ? "landscape" : "portrait",
    unit: "mm",
    format: [layout.pageWidthMm, layout.pageHeightMm],
    hotfixes: ["px_scaling"],
  });

  for (let sheet = 0; sheet < sheetCount; sheet++) {
    if (sheet > 0) doc.addPage([layout.pageWidthMm, layout.pageHeightMm], layout.pageWidthMm >= layout.pageHeightMm ? "l" : "p");

    for (let i = 0; i < cellsPerSheet; i++) {
      const cellIndex = sheet * cellsPerSheet + i;
      const photo = cells[cellIndex];
      let x: number, y: number, cellW: number, cellH: number;
      if (useFlexible && flexibleLayout) {
        const rect = getFlexibleCellRect(flexibleLayout, i);
        if (!rect) continue;
        x = rect.xMm;
        y = rect.yMm;
        cellW = rect.widthMm;
        cellH = rect.heightMm;
      } else {
        const cellWU = layout.cellWidthMm;
        const cellHU = layout.cellHeightMm;
        const row = Math.floor(i / layout.cols);
        const col = i % layout.cols;
        x = margin + col * (cellWU + gap);
        y = margin + row * (cellHU + gap);
        cellW = cellWU;
        cellH = cellHU;
      }
      const cellWPx = Math.round(cellW * PX_PER_MM);
      const cellHPx = Math.round(cellH * PX_PER_MM);

      if (photo?.url) {
        try {
          const img = await loadImage(photo.url);
          if (img.naturalWidth === 0 || img.naturalHeight === 0) {
            console.warn("Cell", cellIndex, "image has no dimensions");
            continue;
          }
          const canvas = drawCellToCanvas(
            img,
            photo,
            cellWPx,
            cellHPx,
            borderRadiusPx,
            cellPaddingPx
          );
          const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
          doc.addImage(dataUrl, "JPEG", x, y, cellW, cellH, undefined, "FAST");
          drawCellBorder(doc, x, y, cellW, cellH, appearance);
        } catch (e) {
          console.warn("Cell", cellIndex, "image failed:", e);
        }
      }
    }

    // Dibujar guías si están habilitadas
    if (guides.length > 0) {
      doc.setDrawColor(0, 0, 255); // Azul
      doc.setLineWidth(0.1);
      doc.setLineDashPattern([2, 2], 0); // Punteado
      
      guides.forEach((guide) => {
        if (guide.orientation === "horizontal") {
          doc.line(0, guide.positionMm, layout.pageWidthMm, guide.positionMm);
        } else {
          doc.line(guide.positionMm, 0, guide.positionMm, layout.pageHeightMm);
        }
      });
      
      doc.setLineDashPattern([], 0); // Reset a sólido
    }
  }

  return doc.output("blob");
}
