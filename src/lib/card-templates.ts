/**
 * Plantillas de card (Grid Maker): almacenamiento y cálculo de posiciones en hoja.
 * Una plantilla define marco + placeholders; se empaquetan N cards en la hoja.
 */

import type { CardTemplate } from "@/types/card-template";
import { isCardTemplate, getPlaceholderImageRect, getPlaceholderImageRectRotated, normalizePlaceholder } from "@/types/card-template";
import type { CellRect } from "./sheet-layout";
import { packCellsOnPage } from "./sheet-layout";

/** Tolerancia para comparar dimensiones en mm (evitar errores de punto flotante). */
const EPSILON_MM = 1e-6;

const STORAGE_KEY = "photo-printer-card-templates";

/** Devuelve todas las plantillas (guardadas + incluidas). Las guardadas tienen id que no empieza por "builtin:". */
export function getAllTemplates(): CardTemplate[] {
  const raw = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
  let saved: CardTemplate[] = [];
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : [];
      saved = list.filter((t): t is CardTemplate => isCardTemplate(t) && isValidTemplate(t));
    } catch {
      saved = [];
    }
  }
  const builtIn = getBuiltInTemplates();
  const savedIds = new Set(saved.map((t) => t.id));
  const builtInFiltered = builtIn.filter((t) => !savedIds.has(t.id));
  return [...saved, ...builtInFiltered];
}

function isValidTemplate(t: CardTemplate): boolean {
  return Array.isArray(t.placeholders) && t.placeholders.length > 0;
}

/** Plantillas incluidas por defecto (vacío; el usuario crea las suyas en Grid Maker). */
function getBuiltInTemplates(): CardTemplate[] {
  return [];
}

export function getTemplateById(id: string): CardTemplate | undefined {
  return getAllTemplates().find((t) => t.id === id);
}

export function saveTemplates(templates: CardTemplate[]): void {
  const builtInIds = new Set(getBuiltInTemplates().map((t) => t.id));
  const toSave = templates.filter((t) => !builtInIds.has(t.id));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
}

export function saveTemplate(template: CardTemplate): void {
  const normalized: CardTemplate = {
    ...template,
    placeholders: template.placeholders.map((p) =>
      normalizePlaceholder(p, template.widthMm, template.heightMm)
    ),
  };
  const all = getAllTemplates();
  const idx = all.findIndex((t) => t.id === template.id);
  const next = idx >= 0 ? [...all] : [...all, normalized];
  if (idx >= 0) next[idx] = normalized;
  saveTemplates(next);
}

export function deleteTemplate(id: string): void {
  if (id.startsWith("builtin:")) return;
  const all = getAllTemplates().filter((t) => t.id !== id);
  saveTemplates(all);
}

/**
 * Calcula los rects de las fotos en coordenadas de hoja (mm), empaquetando
 * tantas cards de la plantilla como quepan. Usa el primer placeholder de cada card.
 */
export function getTemplateCellRects(
  template: CardTemplate,
  pageWidthMm: number,
  pageHeightMm: number,
  sheetMarginMm: number,
  gapMm: number
): CellRect[] {
  const cardW = template.widthMm;
  const cardH = template.heightMm;
  const rawPh = template.placeholders[0];
  if (!rawPh) return [];
  const ph = normalizePlaceholder(rawPh, cardW, cardH);
  const img = getPlaceholderImageRect(ph, cardW, cardH);

  const usableW = pageWidthMm - sheetMarginMm * 2;
  const usableH = pageHeightMm - sheetMarginMm * 2;
  const cols = cardW + gapMm <= 0 ? 0 : Math.max(0, Math.floor((usableW + gapMm + EPSILON_MM) / (cardW + gapMm)));
  const rows = cardH + gapMm <= 0 ? 0 : Math.max(0, Math.floor((usableH + gapMm + EPSILON_MM) / (cardH + gapMm)));
  const rects: CellRect[] = [];
  let rowIndex = 0;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cardX = sheetMarginMm + col * (cardW + gapMm);
      const cardY = sheetMarginMm + row * (cardH + gapMm);
      rects.push({
        row: rowIndex,
        colInRow: col,
        xMm: cardX + img.xMm,
        yMm: cardY + img.yMm,
        widthMm: img.widthMm,
        heightMm: img.heightMm,
      });
    }
    rowIndex++;
  }
  return rects;
}

/** Para vista previa/PDF: por cada card en la hoja, devuelve el rect del marco (card) en mm en coordenadas de hoja. */
export function getTemplateCardRects(
  template: CardTemplate,
  pageWidthMm: number,
  pageHeightMm: number,
  sheetMarginMm: number,
  gapMm: number
): { xMm: number; yMm: number; widthMm: number; heightMm: number }[] {
  const cardW = template.widthMm;
  const cardH = template.heightMm;
  const usableW = pageWidthMm - sheetMarginMm * 2;
  const usableH = pageHeightMm - sheetMarginMm * 2;
  const cols = cardW + gapMm <= 0 ? 0 : Math.max(0, Math.floor((usableW + gapMm + EPSILON_MM) / (cardW + gapMm)));
  const rows = cardH + gapMm <= 0 ? 0 : Math.max(0, Math.floor((usableH + gapMm + EPSILON_MM) / (cardH + gapMm)));
  const out: { xMm: number; yMm: number; widthMm: number; heightMm: number }[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      out.push({
        xMm: sheetMarginMm + col * (cardW + gapMm),
        yMm: sheetMarginMm + row * (cardH + gapMm),
        widthMm: cardW,
        heightMm: cardH,
      });
    }
  }
  return out;
}

/**
 * Layout inteligente para plantillas: empaqueta el máximo de cards mezclando orientación vertical (W×H) y horizontal (H×W).
 * Devuelve los rects de las fotos (celdas) en coordenadas de hoja.
 */
export function getTemplateCellRectsFlexible(
  template: CardTemplate,
  pageWidthMm: number,
  pageHeightMm: number,
  sheetMarginMm: number,
  gapMm: number
): CellRect[] {
  const cardW = template.widthMm;
  const cardH = template.heightMm;
  const rawPh = template.placeholders[0];
  if (!rawPh) return [];
  const ph = normalizePlaceholder(rawPh, cardW, cardH);

  const packed = packCellsOnPage({
    pageWidthMm,
    pageHeightMm,
    marginMm: sheetMarginMm,
    gapMm,
    cellWidthMm: cardW,
    cellHeightMm: cardH,
  });

  return packed.map((cardRect, i) => {
    const isRotated = Math.abs(cardRect.widthMm - cardH) < EPSILON_MM && Math.abs(cardRect.heightMm - cardW) < EPSILON_MM;
    const img = isRotated
      ? getPlaceholderImageRectRotated(ph, cardW, cardH)
      : getPlaceholderImageRect(ph, cardW, cardH);
    return {
      row: cardRect.row,
      colInRow: cardRect.colInRow,
      xMm: cardRect.xMm + img.xMm,
      yMm: cardRect.yMm + img.yMm,
      widthMm: img.widthMm,
      heightMm: img.heightMm,
    };
  });
}

/**
 * Layout inteligente para plantillas: devuelve el rect del marco (card) por cada posición del pack.
 */
export function getTemplateCardRectsFlexible(
  template: CardTemplate,
  pageWidthMm: number,
  pageHeightMm: number,
  sheetMarginMm: number,
  gapMm: number
): { xMm: number; yMm: number; widthMm: number; heightMm: number; rotated?: boolean }[] {
  const cardW = template.widthMm;
  const cardH = template.heightMm;

  const packed = packCellsOnPage({
    pageWidthMm,
    pageHeightMm,
    marginMm: sheetMarginMm,
    gapMm,
    cellWidthMm: cardW,
    cellHeightMm: cardH,
  });

  return packed.map((rect) => ({
    xMm: rect.xMm,
    yMm: rect.yMm,
    widthMm: rect.widthMm,
    heightMm: rect.heightMm,
    rotated: Math.abs(rect.widthMm - cardH) < EPSILON_MM && Math.abs(rect.heightMm - cardW) < EPSILON_MM,
  }));
}

export function createNewTemplate(name: string): CardTemplate {
  const w = 50;
  const h = 50;
  const m = 5;
  const defaultGapMm = 2;
  return {
    id: `user:${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    name: name || "Nueva plantilla",
    widthMm: w,
    heightMm: h,
    gapMm: defaultGapMm,
    placeholders: [
      {
        marginTopMm: m,
        marginBottomMm: m,
        marginLeftMm: m,
        marginRightMm: m,
        paddingTopMm: 0,
        paddingBottomMm: 0,
        paddingLeftMm: 0,
        paddingRightMm: 0,
      },
    ],
  };
}
