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
/** Copia de respaldo en la misma sesión por si el almacenamiento principal queda vacío o corrupto. */
const SESSION_BACKUP_KEY = `${STORAGE_KEY}-session-backup`;

function canUseDomStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function defaultPlaceholderForCard(cardWidthMm: number, cardHeightMm: number) {
  const m = 5;
  return normalizePlaceholder(
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
    cardWidthMm,
    cardHeightMm
  );
}

/** Repara plantillas guardadas (p. ej. placeholders vacíos tras un bug o export incompleto) para no perderlas al cargar. */
function repairStoredTemplate(t: unknown): CardTemplate | null {
  if (!isCardTemplate(t)) return null;
  const w = typeof t.widthMm === "number" && Number.isFinite(t.widthMm) ? t.widthMm : 50;
  const h = typeof t.heightMm === "number" && Number.isFinite(t.heightMm) ? t.heightMm : 50;
  let placeholders = t.placeholders;
  if (!Array.isArray(placeholders) || placeholders.length === 0) {
    placeholders = [defaultPlaceholderForCard(w, h)];
  } else {
    placeholders = placeholders.map((p) => normalizePlaceholder(p, w, h));
  }
  return {
    ...t,
    widthMm: w,
    heightMm: h,
    placeholders,
  };
}

function dedupeTemplatesById(templates: CardTemplate[]): CardTemplate[] {
  const map = new Map<string, CardTemplate>();
  for (const t of templates) {
    if (t.id) map.set(t.id, t);
  }
  return Array.from(map.values());
}

function readStoredTemplateListRaw(): unknown[] {
  if (typeof window === "undefined") return [];

  // Electron: archivo en userData (no depende del origen http ni de localStorage).
  if (window.electronAPI?.readCardTemplatesSync) {
    let fileJson: string;
    try {
      fileJson = window.electronAPI.readCardTemplatesSync();
    } catch {
      fileJson = "";
    }
    if (typeof fileJson === "string" && fileJson.trim()) {
      try {
        const parsed = JSON.parse(fileJson);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    // Migración: si había datos solo en localStorage (versiones anteriores), copiar al archivo una vez.
    if (canUseDomStorage()) {
      const legacy = localStorage.getItem(STORAGE_KEY);
      if (legacy?.trim()) {
        try {
          window.electronAPI.writeCardTemplatesSync(legacy);
          const parsed = JSON.parse(legacy);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      }
    }
    return [];
  }

  if (!canUseDomStorage()) return [];
  let raw = localStorage.getItem(STORAGE_KEY);
  if (!raw && typeof window.sessionStorage !== "undefined") {
    raw = sessionStorage.getItem(SESSION_BACKUP_KEY);
    if (raw) {
      try {
        localStorage.setItem(STORAGE_KEY, raw);
      } catch {
        // Cuota u origen restringido: seguimos con lo que hay en sessionStorage
      }
    }
  }
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadSavedUserTemplates(): CardTemplate[] {
  const list = readStoredTemplateListRaw();
  const repaired = list.map(repairStoredTemplate).filter((t): t is CardTemplate => t !== null);
  return dedupeTemplatesById(repaired);
}

/** Devuelve todas las plantillas (guardadas + incluidas). Las guardadas tienen id que no empieza por "builtin:". */
export function getAllTemplates(): CardTemplate[] {
  const saved = loadSavedUserTemplates();
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
  const toSave = dedupeTemplatesById(templates.filter((t) => !builtInIds.has(t.id)));
  const json = JSON.stringify(toSave);

  if (typeof window !== "undefined" && window.electronAPI?.writeCardTemplatesSync) {
    try {
      const ok = window.electronAPI.writeCardTemplatesSync(json);
      if (!ok) console.error("writeCardTemplatesSync devolvió false");
    } catch (e) {
      console.error("No se pudieron guardar las plantillas (archivo Electron):", e);
    }
    try {
      if (canUseDomStorage()) {
        localStorage.setItem(STORAGE_KEY, json);
        if (typeof window.sessionStorage !== "undefined") {
          sessionStorage.setItem(SESSION_BACKUP_KEY, json);
        }
      }
    } catch {
      /* ignore */
    }
    return;
  }

  if (!canUseDomStorage()) return;
  try {
    localStorage.setItem(STORAGE_KEY, json);
    try {
      if (typeof window.sessionStorage !== "undefined") {
        sessionStorage.setItem(SESSION_BACKUP_KEY, json);
      }
    } catch {
      // sessionStorage lleno o deshabilitado
    }
  } catch (e) {
    console.error("No se pudieron guardar las plantillas en localStorage:", e);
  }
}

export function saveTemplate(template: CardTemplate): void {
  const w = template.widthMm;
  const h = template.heightMm;
  const phSrc =
    Array.isArray(template.placeholders) && template.placeholders.length > 0
      ? template.placeholders
      : [defaultPlaceholderForCard(w, h)];
  const normalized: CardTemplate = {
    ...template,
    placeholders: phSrc.map((p) => normalizePlaceholder(p, w, h)),
  };
  const userOnly = getUserTemplates();
  const idx = userOnly.findIndex((t) => t.id === normalized.id);
  const next =
    idx >= 0 ? userOnly.map((t, i) => (i === idx ? normalized : t)) : [...userOnly, normalized];
  saveTemplates(next);
}

/** Devuelve solo las plantillas creadas por el usuario (sin las builtin). */
export function getUserTemplates(): CardTemplate[] {
  return getAllTemplates().filter((t) => !t.id.startsWith("builtin:"));
}

/** Exporta las plantillas de usuario a JSON legible. */
export function exportUserTemplates(): string {
  const userTemplates = getUserTemplates();
  return JSON.stringify(userTemplates, null, 2);
}

/**
 * Importa plantillas de usuario desde un JSON (array de CardTemplate).
 * Devuelve cuántas se importaron / se omitieron.
 */
export function importUserTemplates(json: string): { imported: number; skipped: number } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("El archivo de plantillas no es un JSON válido.");
  }

  const list = Array.isArray(parsed) ? parsed : [parsed];
  const existing = getUserTemplates();
  const existingIds = new Set(existing.map((t) => t.id));

  const imported: CardTemplate[] = [];
  let skipped = 0;

  for (const item of list) {
    const repaired = repairStoredTemplate(item);
    if (!repaired || !isValidTemplate(repaired)) {
      skipped++;
      continue;
    }
    let id = repaired.id;
    if (!id || existingIds.has(id)) {
      id = `imported:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }
    existingIds.add(id);
    imported.push({
      ...repaired,
      id,
    });
  }

  if (imported.length > 0) {
    saveTemplates([...existing, ...imported]);
  }

  return { imported: imported.length, skipped };
}

export function deleteTemplate(id: string): void {
  if (id.startsWith("builtin:")) return;
  const next = getUserTemplates().filter((t) => t.id !== id);
  saveTemplates(next);
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
    showRulers: false,
    showGuidesInExport: false,
    guides: [],
  };
}
