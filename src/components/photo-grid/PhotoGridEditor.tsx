"use client";

import React, { useCallback, useMemo, useState } from "react";
import pkg from "../../../package.json";
import { cn, formatDisplayNum } from "@/lib/utils";
import { DEFAULT_GRID_APPEARANCE, type GridAppearance } from "@/types/grid-appearance";
import {
  PAGE_PRESETS,
  getDefaultLayout,
  getCellCount,
  buildLayoutFromCustom,
  checkLayoutFits,
  buildFlexibleLayout,
  getFlexibleCellRect,
  checkFlexibleLayoutFits,
  type SheetLayout,
  type PagePresetId,
  type FlexibleLayout,
  type CellRect,
} from "@/lib/sheet-layout";
import { toMm, fromMm, type LengthUnit, UNIT_LABELS } from "@/lib/units";
import type { GridCells, CellPhoto } from "@/types/photo-grid";
import { getPhotoEdit } from "@/types/photo-grid";
import { fileToDisplayBlob, isHeic } from "@/lib/heic";
import {
  getAllTemplates,
  getTemplateById,
  saveTemplate,
  getTemplateCellRects,
  getTemplateCardRects,
  getTemplateCellRectsFlexible,
  getTemplateCardRectsFlexible,
} from "@/lib/card-templates";
import type { CardTemplate, PlaceholderRect } from "@/types/card-template";
import type { Guide, GuideOrientation } from "@/types/guides";
import { GridMakerPanel } from "./GridMakerPanel";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Download, HelpCircle, ImagePlus, Layout, Loader2, Pencil, RotateCcw, RotateCw, Trash2, Ruler, X, Settings, Maximize2 } from "lucide-react";
import { exportGridToPdf } from "@/lib/export-pdf";

const UNITS: LengthUnit[] = ["mm", "cm", "in"];

const APP_NAME = "Photo Printer";
const APP_VERSION = pkg.version ?? "";

/** Factor mm → px para visualización en pantalla (96 DPI). */
const MM_TO_PX_SCREEN = 96 / 25.4;

function createEmptyCells(count: number): GridCells {
  return Array.from({ length: count }, () => null);
}

/**
 * Convierte mm a píxeles para visualización en pantalla (96 DPI).
 * Asegura un mínimo de 1px para que el borde sea visible.
 */
function mmToPx(mm: number): number {
  return Math.max(1, mm * MM_TO_PX_SCREEN);
}

export type PageOrientation = "portrait" | "landscape";

function getPageSizeMm(
  preset: PagePresetId,
  customW: number,
  customH: number,
  orientation: PageOrientation = "portrait"
) {
  let widthMm: number;
  let heightMm: number;
  if (preset === "custom") {
    widthMm = customW;
    heightMm = customH;
  } else {
    const p = PAGE_PRESETS[preset];
    widthMm = p.widthMm;
    heightMm = p.heightMm;
  }
  if (orientation === "landscape" && widthMm < heightMm) {
    [widthMm, heightMm] = [heightMm, widthMm];
  }
  return { widthMm, heightMm };
}

export function PhotoGridEditor() {
  const defaultLayout = useMemo(() => getDefaultLayout(), []);

  const [pagePreset, setPagePreset] = useState<PagePresetId>("a4");
  const [pageOrientation, setPageOrientation] = useState<PageOrientation>("portrait");
  const [customPageWidth, setCustomPageWidth] = useState(210);
  const [customPageHeight, setCustomPageHeight] = useState(297);
  const [customPageUnit, setCustomPageUnit] = useState<LengthUnit>("mm");

  const [marginValue, setMarginValue] = useState(10);
  const [marginUnit, setMarginUnit] = useState<LengthUnit>("mm");

  const [useFlexibleLayout, setUseFlexibleLayout] = useState(true);
  const [cellsPerRowString, setCellsPerRowString] = useState("3, 2");
  const [rows, setRows] = useState(2);
  const [cols, setCols] = useState(2);
  const [sheetCount, setSheetCount] = useState(1);
  const [cellWidthValue, setCellWidthValue] = useState(3);
  const [cellHeightValue, setCellHeightValue] = useState(4);
  const [cellUnit, setCellUnit] = useState<LengthUnit>("in");
  const [gapValue, setGapValue] = useState(2);
  const [gapUnit, setGapUnit] = useState<LengthUnit>("mm");
  const gridAppearance: GridAppearance = DEFAULT_GRID_APPEARANCE;

  const [cells, setCells] = useState<GridCells>(() =>
    createEmptyCells(defaultLayout.rows * defaultLayout.cols)
  );
  const [libraryPhotos, setLibraryPhotos] = useState<CellPhoto[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const [selectedCellIndex, setSelectedCellIndex] = useState<number | null>(null);
  const [fullscreenIndex, setFullscreenIndex] = useState<number | null>(null);
  const [panning, setPanning] = useState<boolean>(false);
  const panStartRef = React.useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const didPanRef = React.useRef<boolean>(false);
  const didHandleRef = React.useRef<boolean>(false);
  const [imageDimensions, setImageDimensions] = useState<Record<number, { w: number; h: number }>>({});
  const [interactionMode, setInteractionMode] = useState<"pan" | "resize" | "rotate" | null>(null);
  const resizeStartRef = React.useRef<{ scale: number; clientX: number; clientY: number; centerX: number; centerY: number } | null>(null);
  const rotateStartRef = React.useRef<{ rotation: number; startAngle: number } | null>(null);
  const [editingScaleInput, setEditingScaleInput] = useState<Record<number, string>>({});
  const [editingRotationInput, setEditingRotationInput] = useState<Record<number, string>>({});
  const libraryFileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [openPanel, setOpenPanel] = useState<"config" | "library" | "gridmaker" | null>(null);
  const [selectedCardTemplateId, setSelectedCardTemplateId] = useState<string | null>(null);
  /** Plantilla que se está editando en el Grid Maker; la vista previa la muestra en vivo. */
  const [editingTemplateFromGridMaker, setEditingTemplateFromGridMaker] = useState<CardTemplate | null>(null);
  /** Actualizador de márgenes del placeholder: lo define el padre según editingTemplateFromGridMaker para que el arrastre siga funcionando aunque se cierre el panel. */
  const placeholderUpdaterRef = React.useRef<((patch: Partial<PlaceholderRect>) => void) | null>(null);
  /** Callback que registra el Grid Maker para salir del modo edición (limpiar su estado) desde el header. */
  const exitTemplateEditRef = React.useRef<(() => void) | null>(null);
  const placeholderDragRef = React.useRef<{
    startX: number;
    startY: number;
    marginLeft: number;
    marginRight: number;
    marginTop: number;
    marginBottom: number;
    mmPerPx: number;
  } | null>(null);
  const closePanelTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const isInteractingRef = React.useRef(false);
  const isLibraryDragActiveRef = React.useRef(false);

  // Funciones helper para manejar el hover del panel con delay
  const handlePanelOpen = useCallback((panel: "config" | "library" | "gridmaker") => {
    if (closePanelTimeoutRef.current) {
      clearTimeout(closePanelTimeoutRef.current);
      closePanelTimeoutRef.current = null;
    }
    isInteractingRef.current = false;
    setOpenPanel(panel);
  }, []);

  const handlePanelClose = useCallback(() => {
    // No cerrar si el usuario está interactuando con el panel
    if (isInteractingRef.current) {
      return;
    }
    // No cerrar si hay un drag activo desde la biblioteca
    if (isLibraryDragActiveRef.current) {
      return;
    }
    // No cerrar si hay un drag activo (draggedIndex está establecido)
    if (draggedIndex !== null) {
      return;
    }
    if (closePanelTimeoutRef.current) {
      clearTimeout(closePanelTimeoutRef.current);
    }
    closePanelTimeoutRef.current = setTimeout(() => {
      // Verificar nuevamente antes de cerrar
      if (!isInteractingRef.current && !isLibraryDragActiveRef.current && draggedIndex === null) {
        setOpenPanel(null);
      }
      closePanelTimeoutRef.current = null;
    }, 500); // Delay de 500ms antes de cerrar
  }, [draggedIndex]);

  // El padre es dueño del actualizador de márgenes al arrastrar, así el arrastre sigue funcionando aunque se cierre el panel lateral
  React.useEffect(() => {
    if (editingTemplateFromGridMaker?.placeholders?.length) {
      placeholderUpdaterRef.current = (patch: Partial<PlaceholderRect>) => {
        setEditingTemplateFromGridMaker((prev) => {
          if (!prev?.placeholders?.length) return prev;
          return {
            ...prev,
            placeholders: [{ ...prev.placeholders[0], ...patch }],
          };
        });
      };
    } else {
      placeholderUpdaterRef.current = null;
    }
    return () => {
      placeholderUpdaterRef.current = null;
    };
  }, [editingTemplateFromGridMaker != null]); // solo al entrar/salir del modo edición; no en cada cambio de márgenes para no resetear el ref durante el arrastre

  /** Arrastrar la zona de la foto en la vista previa cuando se está editando una plantilla en el Grid Maker. */
  const handlePlaceholderDragStart = useCallback((e: React.MouseEvent, cardWidthMm: number, ph: PlaceholderRect) => {
    if (!placeholderUpdaterRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    const cardDiv = (e.currentTarget as HTMLElement).parentElement;
    if (!cardDiv) return;
    const cardWidthPx = cardDiv.getBoundingClientRect().width;
    const mmPerPx = cardWidthMm / cardWidthPx;
    placeholderDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      marginLeft: ph.marginLeftMm,
      marginRight: ph.marginRightMm,
      marginTop: ph.marginTopMm,
      marginBottom: ph.marginBottomMm,
      mmPerPx,
    };
    const onMove = (ev: MouseEvent) => {
      const d = placeholderDragRef.current;
      if (!d || !placeholderUpdaterRef.current) return;
      const dxPx = ev.clientX - d.startX;
      const dyPx = ev.clientY - d.startY;
      const dxMm = dxPx * d.mmPerPx;
      const dyMm = dyPx * d.mmPerPx;
      const newLeft = d.marginLeft + dxMm;
      const newRight = d.marginRight - dxMm;
      const newTop = d.marginTop + dyMm;
      const newBottom = d.marginBottom - dyMm;
      if (newLeft >= 0 && newRight >= 0 && newTop >= 0 && newBottom >= 0) {
        placeholderUpdaterRef.current({
          marginLeftMm: newLeft,
          marginRightMm: newRight,
          marginTopMm: newTop,
          marginBottomMm: newBottom,
        });
      }
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      placeholderDragRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  const handlePanelCancelClose = useCallback(() => {
    if (closePanelTimeoutRef.current) {
      clearTimeout(closePanelTimeoutRef.current);
      closePanelTimeoutRef.current = null;
    }
    isInteractingRef.current = true;
  }, []);

  const handlePanelInteractionStart = useCallback((e?: React.MouseEvent | React.FocusEvent) => {
    // No interferir con drag and drop
    if (e && 'type' in e && e.type === 'mousedown') {
      const target = e.target as HTMLElement;
      // Si el elemento es draggable o está dentro de un elemento draggable, no interferir
      if (target.closest('[draggable="true"]')) {
        return;
      }
    }
    isInteractingRef.current = true;
    if (closePanelTimeoutRef.current) {
      clearTimeout(closePanelTimeoutRef.current);
      closePanelTimeoutRef.current = null;
    }
  }, []);

  const handlePanelInteractionEnd = useCallback(() => {
    // Esperar un poco antes de permitir el cierre
    setTimeout(() => {
      isInteractingRef.current = false;
    }, 100);
  }, []);

  // Detectar cuando un Select está abierto y mantener el panel abierto
  React.useEffect(() => {
    if (!openPanel) return;

    const checkSelectOpen = () => {
      // Buscar cualquier Select abierto (shadcn/ui usa Radix UI)
      // Radix Select usa atributos data-state="open" en el trigger y content
      const selectContent = document.querySelector('[role="listbox"]') ||
                           document.querySelector('[data-radix-select-content]') ||
                           document.querySelector('[data-radix-popper-content-wrapper]');
      
      // Verificar si el trigger tiene data-state="open"
      const openTriggers = document.querySelectorAll('[data-radix-select-trigger][data-state="open"]');
      
      if (selectContent || openTriggers.length > 0) {
        isInteractingRef.current = true;
        if (closePanelTimeoutRef.current) {
          clearTimeout(closePanelTimeoutRef.current);
          closePanelTimeoutRef.current = null;
        }
        return true;
      }
      return false;
    };

    // Verificar periódicamente si hay un Select abierto
    const interval = setInterval(() => {
      checkSelectOpen();
    }, 50); // Verificar cada 50ms para ser más responsivo
    
    // También verificar cuando se hace click en un SelectTrigger
    const handleSelectClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const selectTrigger = target.closest('[data-radix-select-trigger]') ||
                           target.closest('button[aria-haspopup="listbox"]');
      
      if (selectTrigger) {
        isInteractingRef.current = true;
        if (closePanelTimeoutRef.current) {
          clearTimeout(closePanelTimeoutRef.current);
          closePanelTimeoutRef.current = null;
        }
        // Verificar después de un pequeño delay para que el Select se abra
        setTimeout(() => {
          checkSelectOpen();
        }, 100);
      }
    };
    
    // Verificar en eventos de click y focus
    document.addEventListener('click', handleSelectClick, true);
    document.addEventListener('focusin', checkSelectOpen, true);
    
    return () => {
      clearInterval(interval);
      document.removeEventListener('click', handleSelectClick, true);
      document.removeEventListener('focusin', checkSelectOpen, true);
    };
  }, [openPanel]);

  // Ya no cerramos los paneles al clickear fuera; solo se controlan con el estado explícito.
  React.useEffect(() => {
    return;
  }, [openPanel]);

  // Limpiar timeout al desmontar
  React.useEffect(() => {
    return () => {
      if (closePanelTimeoutRef.current) {
        clearTimeout(closePanelTimeoutRef.current);
      }
    };
  }, []);

  // Estado para reglas y guías
  const [showRulers, setShowRulers] = useState(false);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [showGuidesInExport, setShowGuidesInExport] = useState(false);
  const [draggingGuide, setDraggingGuide] = useState<{ id: string; orientation: GuideOrientation } | null>(null);

  const layout = useMemo((): SheetLayout => {
    const customW = toMm(customPageWidth, customPageUnit);
    const customH = toMm(customPageHeight, customPageUnit);
    const { widthMm: pageWidthMm, heightMm: pageHeightMm } = getPageSizeMm(
      pagePreset,
      customW,
      customH,
      pageOrientation
    );
    return buildLayoutFromCustom({
      pageWidthMm,
      pageHeightMm,
      marginMm: toMm(marginValue, marginUnit),
      gapMm: toMm(gapValue, gapUnit),
      rows,
      cols,
      cellWidthMm: toMm(cellWidthValue, cellUnit),
      cellHeightMm: toMm(cellHeightValue, cellUnit),
    });
  }, [
    pagePreset,
    pageOrientation,
    customPageWidth,
    customPageHeight,
    customPageUnit,
    marginValue,
    marginUnit,
    gapValue,
    gapUnit,
    rows,
    cols,
    cellWidthValue,
    cellHeightValue,
    cellUnit,
  ]);

  // Plantilla de Grid Maker activa: si se está editando una en el panel, la vista previa usa esa versión en vivo
  const cardTemplate = selectedCardTemplateId ? getTemplateById(selectedCardTemplateId) : null;
  const effectiveCardTemplate = editingTemplateFromGridMaker ?? cardTemplate;
  const templateGapMm = effectiveCardTemplate?.gapMm ?? layout.gapMm;
  const templateCellRects = useMemo((): CellRect[] | null => {
    if (!effectiveCardTemplate) return null;
    if (useFlexibleLayout) {
      return getTemplateCellRectsFlexible(
        effectiveCardTemplate,
        layout.pageWidthMm,
        layout.pageHeightMm,
        layout.marginMm,
        templateGapMm
      );
    }
    return getTemplateCellRects(
      effectiveCardTemplate,
      layout.pageWidthMm,
      layout.pageHeightMm,
      layout.marginMm,
      templateGapMm
    );
  }, [effectiveCardTemplate, useFlexibleLayout, layout.pageWidthMm, layout.pageHeightMm, layout.marginMm, templateGapMm]);
  const templateCardRects = useMemo((): { xMm: number; yMm: number; widthMm: number; heightMm: number; rotated?: boolean }[] | null => {
    if (!effectiveCardTemplate) return null;
    if (useFlexibleLayout) {
      return getTemplateCardRectsFlexible(
        effectiveCardTemplate,
        layout.pageWidthMm,
        layout.pageHeightMm,
        layout.marginMm,
        templateGapMm
      );
    }
    return getTemplateCardRects(
      effectiveCardTemplate,
      layout.pageWidthMm,
      layout.pageHeightMm,
      layout.marginMm,
      templateGapMm
    );
  }, [effectiveCardTemplate, useFlexibleLayout, layout.pageWidthMm, layout.pageHeightMm, layout.marginMm, templateGapMm]);

  // Layout inteligente: empaqueta la mayor cantidad de fotos del tamaño indicado (algunas en horizontal, otras en vertical)
  const flexibleLayout = useMemo((): FlexibleLayout | null => {
    if (!useFlexibleLayout) return null;
    const customW = toMm(customPageWidth, customPageUnit);
    const customH = toMm(customPageHeight, customPageUnit);
    const { widthMm: pageWidthMm, heightMm: pageHeightMm } = getPageSizeMm(
      pagePreset,
      customW,
      customH,
      pageOrientation
    );
    return buildFlexibleLayout({
      pageWidthMm,
      pageHeightMm,
      marginMm: toMm(marginValue, marginUnit),
      gapMm: toMm(gapValue, gapUnit),
      cellWidthMm: toMm(cellWidthValue, cellUnit),
      cellHeightMm: toMm(cellHeightValue, cellUnit),
    });
  }, [
    useFlexibleLayout,
    pagePreset,
    pageOrientation,
    customPageWidth,
    customPageHeight,
    customPageUnit,
    marginValue,
    marginUnit,
    gapValue,
    gapUnit,
    cellWidthValue,
    cellHeightValue,
    cellUnit,
  ]);

  const cellsPerSheet =
    (templateCellRects?.length != null && templateCellRects.length > 0)
      ? templateCellRects.length
      : useFlexibleLayout && flexibleLayout
        ? flexibleLayout.cellCount
        : getCellCount(layout);
  const cellCount = cellsPerSheet * sheetCount;
  const fitResult = useMemo(() => {
    if (useFlexibleLayout && effectiveCardTemplate && templateCardRects && templateCellRects && templateCardRects.length > 0) {
      const pseudoLayout: FlexibleLayout = {
        pageWidthMm: layout.pageWidthMm,
        pageHeightMm: layout.pageHeightMm,
        marginMm: layout.marginMm,
        gapMm: templateGapMm,
        cellRects: templateCardRects.map((r, i) => ({
          row: templateCellRects[i].row,
          colInRow: templateCellRects[i].colInRow,
          xMm: r.xMm,
          yMm: r.yMm,
          widthMm: r.widthMm,
          heightMm: r.heightMm,
        })),
        cellCount: templateCardRects.length,
      };
      return checkFlexibleLayoutFits(pseudoLayout);
    }
    if (useFlexibleLayout && flexibleLayout) {
      return checkFlexibleLayoutFits(flexibleLayout);
    }
    return checkLayoutFits(layout);
  }, [useFlexibleLayout, flexibleLayout, layout, effectiveCardTemplate, templateCardRects, templateCellRects, templateGapMm]);

  const ensureCellsLength = useCallback(() => {
    setCells((prev) => {
      if (prev.length === cellCount) return prev;
      const next = [...prev];
      if (next.length < cellCount) {
        while (next.length < cellCount) next.push(null);
      } else {
        next.length = cellCount;
      }
      return next;
    });
  }, [cellCount]);

  const getCellDimensionsMm = useCallback((cellIndex: number) => {
    const cellInSheet = cellIndex % cellsPerSheet;
    if (templateCellRects && templateCellRects[cellInSheet]) {
      const rect = templateCellRects[cellInSheet];
      return { widthMm: rect.widthMm, heightMm: rect.heightMm };
    }
    if (useFlexibleLayout && flexibleLayout) {
      const rect = getFlexibleCellRect(flexibleLayout, cellInSheet);
      if (rect) return { widthMm: rect.widthMm, heightMm: rect.heightMm };
    }
    return { widthMm: layout.cellWidthMm, heightMm: layout.cellHeightMm };
  }, [cellsPerSheet, templateCellRects, useFlexibleLayout, flexibleLayout, layout]);

  React.useEffect(() => ensureCellsLength(), [ensureCellsLength]);

  // Helper para revocar Object URLs de forma segura (no revoca Data URLs)
  const safeRevokeObjectURL = useCallback((url: string | undefined) => {
    if (url && url.startsWith("blob:")) {
      URL.revokeObjectURL(url);
    }
  }, []);

  // Ajustar automáticamente el número de hojas según las imágenes cargadas
  React.useEffect(() => {
    // Contar cuántas celdas tienen fotos
    const filledCells = cells.filter(c => c !== null).length;
    
    // Calcular cuántas hojas se necesitan (mínimo 1)
    const neededSheets = Math.max(1, Math.ceil(filledCells / cellsPerSheet));
    
    // Ajustar sheetCount al número exacto necesario
    // Esto funciona tanto para aumentar como para reducir hojas
    setSheetCount((currentSheetCount) => {
      // Si necesitamos más hojas, aumentar
      if (neededSheets > currentSheetCount) {
        return neededSheets;
      }
      // Si necesitamos menos hojas, reducir
      if (neededSheets < currentSheetCount) {
        return neededSheets;
      }
      // Si es igual, mantener
      return currentSheetCount;
    });
  }, [cells, cellsPerSheet]);

  const handleFileSelect = async (cellIndex: number, files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    const isImage = file.type.startsWith("image/") || isHeic(file);
    if (!isImage) return;
    const { blob, fileName } = await fileToDisplayBlob(file);
    const url = URL.createObjectURL(blob);
    // Añadir también a la biblioteca (con Data URL para persistencia) y vincular con photoId
    const dataUrl = await blobToDataURL(blob);
    const photoId = `photo-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setLibraryPhotos((prev) => [...prev, { url: dataUrl, fileName, photoId }]);
    setImageDimensions((prev) => {
      const next = { ...prev };
      delete next[cellIndex];
      return next;
    });
    setCells((prev) => {
      const next = [...prev];
      safeRevokeObjectURL(next[cellIndex]?.url);
      next[cellIndex] = { url, fileName, photoId };
      return next;
    });
    // Ajustar rotación inicial para que la foto siga la orientación de la celda (horizontal/vertical)
    const img = new Image();
    img.onload = () => {
      const { widthMm: cellW, heightMm: cellH } = getCellDimensionsMm(cellIndex);
      const imgW = img.naturalWidth;
      const imgH = img.naturalHeight;
      let initialRotation = 0;
      if (cellW > cellH && imgW < imgH) initialRotation = 90;
      else if (cellW < cellH && imgW > imgH) initialRotation = -90;
      setCells((prev) => {
        const current = prev[cellIndex];
        if (!current?.url || current.url !== url) return prev;
        return prev.map((c, i) =>
          i === cellIndex ? { ...c, rotation: initialRotation } : c
        ) as GridCells;
      });
    };
    img.src = url;
  };

  const handleDrop = async (targetIndex: number, e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(null);
    
    // Intentar obtener datos de múltiples formas
    let data = e.dataTransfer.getData("application/json");
    if (!data) {
      // Intentar con text/plain como fallback
      const textData = e.dataTransfer.getData("text/plain");
      if (textData && textData.startsWith("{")) {
        data = textData;
      }
    }
    
    const files = e.dataTransfer.files;
    
    if (data) {
      try {
        const payload = JSON.parse(data) as { index: number; source?: string } & CellPhoto;
        const { index, url, fileName, scale, rotation, panX, panY, source, photoId } = payload;

        if (source === "library") {
          // Soltar desde la biblioteca: copiar la foto al target (con photoId para sincronizar)
          setCells((prev) => {
            const next = [...prev];
            const photo: CellPhoto = {
              url,
              ...(fileName != null && { fileName }),
              ...(photoId != null && { photoId }),
              ...(scale != null && { scale }),
              ...(rotation != null && { rotation }),
              ...(panX != null && { panX }),
              ...(panY != null && { panY }),
            };
            safeRevokeObjectURL(next[targetIndex]?.url);
            next[targetIndex] = photo;
            return next;
          });
          setImageDimensions((prev) => {
            const next = { ...prev };
            delete next[targetIndex];
            return next;
          });
          // Limpiar el estado de drag activo
          isLibraryDragActiveRef.current = false;
          // Permitir cerrar el panel después del drop
          setTimeout(() => {
            isInteractingRef.current = false;
          }, 100);
        } else {
          // Soltar desde otra celda del grid (mover/intercambiar)
          setCells((prev) => {
            const next = [...prev];
            const photo: CellPhoto = {
              url,
              ...(fileName != null && { fileName }),
              ...(photoId != null && { photoId }),
              ...(scale != null && { scale }),
              ...(rotation != null && { rotation }),
              ...(panX != null && { panX }),
              ...(panY != null && { panY }),
            };
            if (index === targetIndex) return prev;
            next[index] = null;
            safeRevokeObjectURL(next[targetIndex]?.url);
            next[targetIndex] = photo;
            return next;
          });
          if (payload.index !== targetIndex) {
            setImageDimensions((prev) => {
              const next = { ...prev };
              delete next[targetIndex];
              return next;
            });
          }
          setDraggedIndex(null);
        }
      } catch (_) {}
    } else if (files?.length) {
      const file = files[0];
      const isImage = file.type.startsWith("image/") || isHeic(file);
      if (isImage) {
        const { blob, fileName } = await fileToDisplayBlob(file);
        const url = URL.createObjectURL(blob);
        const dataUrl = await blobToDataURL(blob);
        const photoId = `photo-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        setLibraryPhotos((prev) => [...prev, { url: dataUrl, fileName, photoId }]);
        setImageDimensions((prev) => {
          const next = { ...prev };
          delete next[targetIndex];
          return next;
        });
        setCells((prev) => {
          const next = [...prev];
          safeRevokeObjectURL(next[targetIndex]?.url);
          next[targetIndex] = { url, fileName, photoId };
          return next;
        });
        const img = new Image();
        img.onload = () => {
          const { widthMm: cellW, heightMm: cellH } = getCellDimensionsMm(targetIndex);
          const imgW = img.naturalWidth;
          const imgH = img.naturalHeight;
          let initialRotation = 0;
          if (cellW > cellH && imgW < imgH) initialRotation = 90;
          else if (cellW < cellH && imgW > imgH) initialRotation = -90;
          setCells((prev) =>
            prev.map((c, i) =>
              i === targetIndex && c?.url === url ? { ...c, rotation: initialRotation } : c
            ) as GridCells
          );
        };
        img.src = url;
      }
    }
  };

  // Helper para convertir blob a Data URL (base64) - más persistente que Object URL
  const blobToDataURL = useCallback((blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }, []);

  const addFilesToLibrary = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const fileArray = Array.from(files);
    const newItems: CellPhoto[] = [];
    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      const isImage = file.type.startsWith("image/") || isHeic(file);
      if (!isImage) continue;
      const { blob, fileName } = await fileToDisplayBlob(file);
      const url = await blobToDataURL(blob);
      const photoId = `photo-${Date.now()}-${i}-${Math.random().toString(36).slice(2)}`;
      newItems.push({ url, fileName, photoId });
    }
    if (newItems.length === 0) return;
    setLibraryPhotos((prev) => [...prev, ...newItems]);
    return newItems;
  }, [blobToDataURL]);

  // Añadir fotos a la biblioteca Y automáticamente al grid (en hojas adicionales si hace falta)
  const addFilesToLibraryAndGrid = useCallback(async (files: FileList | null) => {
    if (!files?.length) return;
    setLibraryLoading(true);
    try {
      const newItems = await addFilesToLibrary(files);
      if (!newItems || newItems.length === 0) return;

      // Calcular todo usando el estado previo dentro del callback de setCells
    setCells((prev) => {
      const firstEmptyInPrev = prev.findIndex((c) => !c);
      const startIndexInPrev = firstEmptyInPrev >= 0 ? firstEmptyInPrev : prev.length;
      const neededTotalInPrev = startIndexInPrev + newItems.length;
      const neededSheetsInPrev = Math.ceil(neededTotalInPrev / cellsPerSheet);
      const newCellCountInPrev = neededSheetsInPrev * cellsPerSheet;

      let next = [...prev];
      // Expandir el array si hace falta para acomodar todas las fotos
      while (next.length < newCellCountInPrev) next.push(null);
      if (next.length > newCellCountInPrev) next = next.slice(0, newCellCountInPrev);

      // Colocar las nuevas fotos (con photoId para sincronizar con biblioteca)
      for (let i = 0; i < newItems.length; i++) {
        const idx = startIndexInPrev + i;
        safeRevokeObjectURL(next[idx]?.url);
        const photo = newItems[i];
        next[idx] = { url: photo.url, fileName: photo.fileName, photoId: photo.photoId };
      }
      return next;
    });

    // Limpiar dimensiones de imagen cacheadas para las celdas nuevas
    // El useEffect ajustará automáticamente el número de hojas cuando cells cambie
    setImageDimensions((prev) => {
      const next = { ...prev };
      // Calcular startIndex basándose en el estado actual de cells
      const currentCells = cells;
      const firstEmpty = currentCells.findIndex((c) => !c);
      const startIndex = firstEmpty >= 0 ? firstEmpty : currentCells.length;
      for (let i = 0; i < newItems.length; i++) {
        delete next[startIndex + i];
      }
      return next;
    });
    } finally {
      setLibraryLoading(false);
    }
  }, [addFilesToLibrary, cellsPerSheet, safeRevokeObjectURL, cells]);

  const handleLibraryDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (libraryLoading) return;
    const files = e.dataTransfer.files;
    if (files?.length) {
      await addFilesToLibraryAndGrid(files);
    }
  };

  const handleLibraryDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleLibraryFileInput = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    if (libraryLoading) return;
    await addFilesToLibraryAndGrid(e.target.files);
    e.target.value = "";
  };

  const handleLibraryDragStart = (index: number, e: React.DragEvent) => {
    const photo = libraryPhotos[index];
    if (!photo) {
      e.preventDefault();
      return;
    }
    
    // Marcar que hay un drag activo desde la biblioteca
    isLibraryDragActiveRef.current = true;
    
    // Mantener el panel abierto durante el drag
    isInteractingRef.current = true;
    if (closePanelTimeoutRef.current) {
      clearTimeout(closePanelTimeoutRef.current);
      closePanelTimeoutRef.current = null;
    }
    
    // Configurar los datos del drag - usar ambos formatos para compatibilidad
    const dragData = { source: "library", index, ...photo };
    e.dataTransfer.setData("application/json", JSON.stringify(dragData));
    e.dataTransfer.setData("text/plain", JSON.stringify(dragData)); // Fallback
    e.dataTransfer.effectAllowed = "copy";
  };

  const removeLibraryPhoto = (index: number) => {
    const item = libraryPhotos[index];
    const photoId = item?.photoId;
    setLibraryPhotos((prev) => {
      const next = [...prev];
      const removed = next[index];
      safeRevokeObjectURL(removed?.url);
      next.splice(index, 1);
      return next;
    });
    // Quitar también del grid cualquier celda que tenga esta misma foto
    if (photoId) {
      setCells((prev) =>
        prev.map((c) => (c?.photoId === photoId ? null : c))
      );
      setImageDimensions((prev) => {
        const next = { ...prev };
        cells.forEach((c, i) => {
          if (c?.photoId === photoId) delete next[i];
        });
        return next;
      });
    }
  };

  const handleDragStart = (index: number, e: React.DragEvent) => {
    const photo = cells[index];
    if (!photo) return;
    setDraggedIndex(index);
    e.dataTransfer.setData(
      "application/json",
      JSON.stringify({ index, ...photo })
    );
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", photo.fileName ?? "");
  };

  const handleDragOver = (index: number, e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Detectar si viene de la biblioteca usando types (getData no funciona en dragover)
    const types = Array.from(e.dataTransfer.types);
    let dropEffect: "move" | "copy" = "move";
    
    // Si tiene application/json, podría ser de la biblioteca o de otra celda
    // Usamos el effectAllowed como indicador
    if (e.dataTransfer.effectAllowed === "copy" || types.includes("application/json")) {
      dropEffect = "copy";
    }
    
    // Si hay archivos, también es copy
    if (e.dataTransfer.files.length > 0) {
      dropEffect = "copy";
    }
    
    e.dataTransfer.dropEffect = dropEffect;
    setDropTarget(index);
  };

  const handleDragLeave = () => setDropTarget(null);
  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDropTarget(null);
  };

  const clearCell = (index: number) => {
    const photoId = cells[index]?.photoId;
    setImageDimensions((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
    setCells((prev) => {
      const next = [...prev];
      safeRevokeObjectURL(next[index]?.url);
      next[index] = null;
      return next;
    });
    // Quitar también de la biblioteca si esta celda tenía photoId
    if (photoId) {
      setLibraryPhotos((prev) => prev.filter((p) => p.photoId !== photoId));
    }
    if (selectedCellIndex === index) setSelectedCellIndex(null);
  };

  const updatePhotoEdit = useCallback(
    (cellIndex: number, patch: Partial<Pick<CellPhoto, "scale" | "rotation" | "panX" | "panY">>) => {
      setCells((prev) => {
        const photo = prev[cellIndex];
        if (!photo) return prev;
        const next = [...prev];
        next[cellIndex] = { ...photo, ...patch };
        return next;
      });
    },
    []
  );

  // Funciones helper para aplicar valores de escala y rotación al presionar Enter
  const applyScaleValue = useCallback((cellIndex: number) => {
    const raw = editingScaleInput[cellIndex];
    if (raw === undefined) return;
    const v = parseFloat(raw);
    if (!Number.isNaN(v)) {
      updatePhotoEdit(cellIndex, { scale: Math.max(0.5, Math.min(2, v / 100)) });
    }
    setEditingScaleInput((p) => {
      const n = { ...p };
      delete n[cellIndex];
      return n;
    });
  }, [editingScaleInput, updatePhotoEdit]);

  const applyRotationValue = useCallback((cellIndex: number) => {
    const raw = editingRotationInput[cellIndex];
    if (raw === undefined) return;
    const v = parseFloat(raw);
    if (!Number.isNaN(v)) {
      updatePhotoEdit(cellIndex, { rotation: Math.max(-180, Math.min(180, v)) });
    }
    setEditingRotationInput((p) => {
      const n = { ...p };
      delete n[cellIndex];
      return n;
    });
  }, [editingRotationInput, updatePhotoEdit]);

  const handlePanStart = useCallback(
    (cellIndex: number, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      didPanRef.current = false;
      const photo = cells[cellIndex];
      if (!photo) return;
      const edit = getPhotoEdit(photo);
      setPanning(true);
      panStartRef.current = { x: e.clientX, y: e.clientY, panX: edit.panX, panY: edit.panY };
    },
    [cells]
  );

  // Cerrar el modo pantalla completa si se elimina la foto de la celda activa
  React.useEffect(() => {
    if (fullscreenIndex !== null && !cells[fullscreenIndex]) {
      setFullscreenIndex(null);
    }
  }, [cells, fullscreenIndex]);

  // Navegación por teclado en modo pantalla completa (flechas izquierda/derecha y Escape)
  React.useEffect(() => {
    if (fullscreenIndex === null) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setFullscreenIndex(null);
        return;
      }

      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        setFullscreenIndex((current) => {
          if (current === null) return current;
          if (!cells.length) return current;

          const direction = e.key === "ArrowRight" ? 1 : -1;
          let next = current;

          // Buscar la siguiente celda con foto, con wrap-around
          for (let i = 0; i < cells.length; i++) {
            next = (next + direction + cells.length) % cells.length;
            if (cells[next]) {
              return next;
            }
          }

          return current;
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [fullscreenIndex, cells]);

  const handleResizeStart = useCallback(
    (cellIndex: number, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      didHandleRef.current = true;
      const photo = cells[cellIndex];
      if (!photo) return;
      const cellEl = document.querySelector(`[data-cell-index="${cellIndex}"]`);
      if (!cellEl) return;
      const rect = (cellEl as HTMLElement).getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      resizeStartRef.current = {
        scale: getPhotoEdit(photo).scale,
        clientX: e.clientX,
        clientY: e.clientY,
        centerX,
        centerY,
      };
      setInteractionMode("resize");
    },
    [cells]
  );

  const handleRotateStart = useCallback(
    (cellIndex: number, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      didHandleRef.current = true;
      const photo = cells[cellIndex];
      if (!photo) return;
      const cellEl = document.querySelector(`[data-cell-index="${cellIndex}"]`);
      if (!cellEl) return;
      const rect = (cellEl as HTMLElement).getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const startAngle = Math.atan2(e.clientY - cy, e.clientX - cx);
      rotateStartRef.current = { rotation: getPhotoEdit(photo).rotation, startAngle };
      setInteractionMode("rotate");
    },
    [cells]
  );

  React.useEffect(() => {
    if (!panning || panStartRef.current === null) return;
    const onMove = (e: MouseEvent) => {
      const start = panStartRef.current;
      if (!start) return;
      const cellIdx = selectedCellIndex;
      if (cellIdx === null) return;
      const cellEl = document.querySelector(`[data-cell-index="${cellIdx}"]`) as HTMLElement | null;
      if (!cellEl) return;
      didPanRef.current = true;
      const rect = cellEl.getBoundingClientRect();
      const cellW = rect.width;
      const cellH = rect.height;
      const isRotated = cellEl.getAttribute("data-cell-rotated") === "true";
      let deltaX: number;
      let deltaY: number;
      if (isRotated) {
        // Celda rotada -90°: el eje X lógico apunta arriba en pantalla, el Y lógico a la derecha
        deltaX = -(e.clientY - start.y) / cellW;
        deltaY = (e.clientX - start.x) / cellH;
      } else {
        deltaX = (e.clientX - start.x) / cellW;
        deltaY = (e.clientY - start.y) / cellH;
      }
      const newPanX = Math.max(-1, Math.min(1, start.panX + deltaX));
      const newPanY = Math.max(-1, Math.min(1, start.panY + deltaY));
      updatePhotoEdit(cellIdx, { panX: newPanX, panY: newPanY });
    };
    const onUp = () => {
      setPanning(false);
      panStartRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [panning, selectedCellIndex, updatePhotoEdit]);

  React.useEffect(() => {
    if (interactionMode !== "resize" || selectedCellIndex === null || resizeStartRef.current === null) return;
    const onMove = (e: MouseEvent) => {
      const start = resizeStartRef.current;
      if (!start) return;
      const cellEl = document.querySelector(`[data-cell-index="${selectedCellIndex}"]`);
      if (!cellEl) return;
      const rect = (cellEl as HTMLElement).getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const startDist = Math.hypot(start.clientX - cx, start.clientY - cy) || 1;
      const curDist = Math.hypot(e.clientX - cx, e.clientY - cy);
      const newScale = Math.max(0.25, Math.min(3, start.scale * (curDist / startDist)));
      updatePhotoEdit(selectedCellIndex, { scale: newScale });
    };
    const onUp = () => {
      setInteractionMode(null);
      resizeStartRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [interactionMode, selectedCellIndex, updatePhotoEdit]);

  React.useEffect(() => {
    if (interactionMode !== "rotate" || selectedCellIndex === null || rotateStartRef.current === null) return;
    const onMove = (e: MouseEvent) => {
      const start = rotateStartRef.current;
      if (!start) return;
      const cellEl = document.querySelector(`[data-cell-index="${selectedCellIndex}"]`);
      if (!cellEl) return;
      const rect = (cellEl as HTMLElement).getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const curAngle = Math.atan2(e.clientY - cy, e.clientX - cx);
      const deltaDeg = ((curAngle - start.startAngle) * 180) / Math.PI;
      let newRotation = start.rotation + deltaDeg;
      while (newRotation > 180) newRotation -= 360;
      while (newRotation < -180) newRotation += 360;
      updatePhotoEdit(selectedCellIndex, { rotation: newRotation });
    };
    const onUp = () => {
      setInteractionMode(null);
      rotateStartRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [interactionMode, selectedCellIndex, updatePhotoEdit]);

  // Funciones para manejar guías
  const addGuide = useCallback((orientation: GuideOrientation, positionMm: number): string => {
    const newGuide: Guide = {
      id: `guide-${Date.now()}-${Math.random()}`,
      orientation,
      positionMm,
    };
    setGuides((prev) => [...prev, newGuide]);
    return newGuide.id;
  }, []);

  const removeGuide = useCallback((id: string) => {
    setGuides((prev) => prev.filter((g) => g.id !== id));
  }, []);

  const updateGuidePosition = useCallback((id: string, positionMm: number) => {
    setGuides((prev) =>
      prev.map((g) => (g.id === id ? { ...g, positionMm } : g))
    );
  }, []);

  const handleRulerMouseDown = useCallback(
    (e: React.MouseEvent, orientation: GuideOrientation) => {
      e.preventDefault();
      e.stopPropagation();
      
      const pageEl = e.currentTarget.closest('[data-page-preview]');
      if (!pageEl) return;
      
      const rect = (pageEl as HTMLElement).getBoundingClientRect();
      let positionMm: number;
      
      if (orientation === "horizontal") {
        const y = e.clientY - rect.top;
        positionMm = (y / rect.height) * layout.pageHeightMm;
      } else {
        const x = e.clientX - rect.left;
        positionMm = (x / rect.width) * layout.pageWidthMm;
      }
      
      // Asegurar que la guía esté dentro de los márgenes
      const marginMm = layout.marginMm;
      positionMm = Math.max(marginMm, Math.min(
        positionMm,
        orientation === "horizontal" ? layout.pageHeightMm - marginMm : layout.pageWidthMm - marginMm
      ));
      
      // Crear una guía temporal que se actualizará al arrastrar
      const tempGuideId = `temp-guide-${Date.now()}-${Math.random()}`;
      const newGuideId = addGuide(orientation, positionMm);
      setDraggingGuide({ id: newGuideId, orientation });
    },
    [layout, addGuide]
  );

  const handleGuideMouseDown = useCallback((e: React.MouseEvent, guideId: string, orientation: GuideOrientation) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggingGuide({ id: guideId, orientation });
  }, []);

  React.useEffect(() => {
    if (!draggingGuide) return;

    const onMove = (e: MouseEvent) => {
      // Usar el elemento bajo el cursor para soportar vista normal y pantalla completa
      const underCursor = document.elementFromPoint(e.clientX, e.clientY);
      const pageEl = underCursor?.closest?.('[data-page-preview]') ?? document.querySelector('[data-page-preview]');
      if (!pageEl) return;

      const rect = (pageEl as HTMLElement).getBoundingClientRect();
      let positionMm: number;

      if (draggingGuide.orientation === "horizontal") {
        const y = e.clientY - rect.top;
        positionMm = (y / rect.height) * layout.pageHeightMm;
      } else {
        const x = e.clientX - rect.left;
        positionMm = (x / rect.width) * layout.pageWidthMm;
      }

      // Limitar dentro de los márgenes
      const marginMm = layout.marginMm;
      positionMm = Math.max(marginMm, Math.min(
        positionMm,
        draggingGuide.orientation === "horizontal"
          ? layout.pageHeightMm - marginMm
          : layout.pageWidthMm - marginMm
      ));

      updateGuidePosition(draggingGuide.id, positionMm);
    };

    const onUp = () => {
      setDraggingGuide(null);
    };

    // Usar capture phase para asegurar que se capture el evento
    window.addEventListener("mousemove", onMove, true);
    window.addEventListener("mouseup", onUp, true);

    return () => {
      window.removeEventListener("mousemove", onMove, true);
      window.removeEventListener("mouseup", onUp, true);
    };
  }, [draggingGuide, layout, updateGuidePosition]);

  const exportPdf = async () => {
    setExporting(true);
    try {
      const customLayout =
        templateCellRects?.length
          ? { pageWidthMm: layout.pageWidthMm, pageHeightMm: layout.pageHeightMm, marginMm: 0, gapMm: 0, cellRects: templateCellRects, cellCount: templateCellRects.length }
          : useFlexibleLayout ? flexibleLayout : null;
      const blob = await exportGridToPdf(
        layout,
        cells,
        gridAppearance,
        sheetCount,
        showGuidesInExport ? guides : [],
        customLayout,
        templateCellRects?.length && effectiveCardTemplate ? templateCardRects : null,
        effectiveCardTemplate ?? null
      );
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `photo-grid-${Date.now()}.pdf`;
      a.click();
      URL.revokeObjectURL(a.href);
    } finally {
      setExporting(false);
    }
  };

  const renderCell = (
    index: number,
    cellWidthMm: number,
    cellHeightMm: number,
    options?: { disableBorders?: boolean; cellRotated?: boolean; hideActionButtons?: boolean }
  ) => {
    const isTemplateEditMode = editingTemplateFromGridMaker != null;
    const disableBorders = options?.disableBorders ?? false;
    const cellRotated = options?.cellRotated ?? false;
    const hideActionButtons = options?.hideActionButtons ?? false;
    const photo = cells[index] ?? null;
    return (
      <div
        key={index}
        data-cell-index={index}
        data-cell-rotated={cellRotated ? "true" : undefined}
        className={cn(
          "relative bg-muted/50 flex items-center justify-center",
          selectedCellIndex === index && "z-10",
          !disableBorders && !gridAppearance.showBorders && "border-2 border-dashed overflow-hidden",
          !disableBorders && gridAppearance.showBorders && "overflow-hidden",
          dropTarget === index && "border-primary bg-primary/10",
          draggedIndex === index && "opacity-50"
        )}
        style={{
          width: `${cellWidthMm}mm`,
          minWidth: `${cellWidthMm}mm`,
          height: `${cellHeightMm}mm`,
          minHeight: `${cellHeightMm}mm`,
          ...(!disableBorders && gridAppearance.showBorders
            ? {
                borderWidth: `${mmToPx(gridAppearance.borderWidthMm)}px`,
                borderStyle: gridAppearance.borderStyle === "dotted" ? "dotted" : "solid",
                borderRadius: `${gridAppearance.borderRadiusMm}mm`,
                borderColor:
                  dropTarget === index ? "hsl(var(--primary))" : "hsl(var(--border))",
                boxSizing: "border-box",
              }
            : {}),
        }}
        onDragOver={isTemplateEditMode ? undefined : (e) => handleDragOver(index, e)}
        onDragLeave={isTemplateEditMode ? undefined : handleDragLeave}
        onDrop={isTemplateEditMode ? undefined : (e) => handleDrop(index, e)}
      >
        {photo ? (
          <>
            <div
              className={cn(
                "absolute flex items-center justify-center overflow-hidden",
                selectedCellIndex === index ? "cursor-move" : "cursor-grab active:cursor-grabbing"
              )}
              style={{
                top: `${gridAppearance.cellPaddingMm}mm`,
                right: `${gridAppearance.cellPaddingMm}mm`,
                bottom: `${gridAppearance.cellPaddingMm}mm`,
                left: `${gridAppearance.cellPaddingMm}mm`,
                touchAction: "none",
              }}
              draggable={selectedCellIndex !== index}
              onDragStart={selectedCellIndex === index ? undefined : (e) => handleDragStart(index, e)}
              onDragEnd={handleDragEnd}
              onMouseDown={
                selectedCellIndex === index && interactionMode === null
                  ? (e) => handlePanStart(index, e)
                  : undefined
              }
              onClick={(e) => {
                e.stopPropagation();
                if (didPanRef.current) {
                  didPanRef.current = false;
                  return;
                }
                if (didHandleRef.current) {
                  didHandleRef.current = false;
                  return;
                }
                setSelectedCellIndex((prev) => (prev === index ? null : index));
              }}
            >
              <div
                className={cn(
                  "absolute origin-center",
                  selectedCellIndex === index && "outline outline-2 outline-primary outline-offset-1"
                )}
                style={{
                  left: "50%",
                  top: "50%",
                  transformOrigin: "center center",
                  width: "100%",
                  height: "100%",
                  transform: (() => {
                    const edit = getPhotoEdit(photo);
                    const tx = edit.panX * 50;
                    const ty = edit.panY * 50;
                    return `translate(-50%, -50%) translate(${tx}%, ${ty}%) rotate(${edit.rotation}deg) scale(${edit.scale})`;
                  })(),
                }}
              >
                <div className="absolute inset-0">
                  <img
                    src={photo.url}
                    alt=""
                    className="w-full h-full object-contain pointer-events-none select-none"
                    draggable={false}
                    style={{ width: "100%", height: "100%", objectFit: "contain" }}
                    onLoad={(e) => {
                      const img = e.currentTarget;
                      setImageDimensions((prev) => ({
                        ...prev,
                        [index]: { w: img.naturalWidth, h: img.naturalHeight },
                      }));
                    }}
                  />
                </div>
                {selectedCellIndex === index && (
                  <div
                    className="absolute inset-0 pointer-events-none [&>*]:pointer-events-auto"
                    style={cellRotated ? { transform: "rotate(-90deg)", transformOrigin: "center center" } : undefined}
                  >
                    <div className="absolute left-0 top-0 size-3 -translate-x-1/2 -translate-y-1/2 rounded-sm border-2 border-primary bg-background cursor-nwse-resize shadow z-10" title="Redimensionar (esquina)" onMouseDown={(e) => handleResizeStart(index, e)} />
                    <div className="absolute right-0 top-0 size-3 translate-x-1/2 -translate-y-1/2 rounded-sm border-2 border-primary bg-background cursor-nesw-resize shadow z-10" title="Redimensionar (esquina)" onMouseDown={(e) => handleResizeStart(index, e)} />
                    <div className="absolute right-0 bottom-0 size-3 translate-x-1/2 translate-y-1/2 rounded-sm border-2 border-primary bg-background cursor-nwse-resize shadow z-10" title="Redimensionar (esquina)" onMouseDown={(e) => handleResizeStart(index, e)} />
                    <div className="absolute left-0 bottom-0 size-3 -translate-x-1/2 translate-y-1/2 rounded-sm border-2 border-primary bg-background cursor-nesw-resize shadow z-10" title="Redimensionar (esquina)" onMouseDown={(e) => handleResizeStart(index, e)} />
                    <div className="absolute left-1/2 -top-7 size-6 -translate-x-1/2 rounded-full border-2 border-primary bg-background cursor-grab active:cursor-grabbing shadow z-10 flex items-center justify-center" title="Rotar (arrastrar)" onMouseDown={(e) => handleRotateStart(index, e)}>
                      <svg className="size-3.5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9h9" /></svg>
                    </div>
                  </div>
                )}
              </div>
            </div>
            {!hideActionButtons && (
              <div
                className={cn(
                  "absolute flex gap-1 z-10",
                  cellRotated && "bottom-1 right-1",
                  !cellRotated && !disableBorders && "top-1 right-1"
                )}
                style={
                  cellRotated
                    ? { transform: "rotate(-90deg)", transformOrigin: "bottom right" }
                    : disableBorders
                      ? { top: "2mm", right: "2mm" }
                      : undefined
                }
              >
                <Button type="button" size="icon" variant={selectedCellIndex === index ? "default" : "secondary"} className="size-7 opacity-90 hover:opacity-100" onClick={(e) => { e.stopPropagation(); setSelectedCellIndex((prev) => (prev === index ? null : index)); }} title={selectedCellIndex === index ? "Cerrar edición" : "Editar imagen"}>
                  <Pencil className="size-3.5" />
                </Button>
                <Button type="button" size="icon" variant="destructive" className="size-7 opacity-80 hover:opacity-100" onClick={(e) => { e.stopPropagation(); clearCell(index); }}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            )}
          </>
        ) : (
          isTemplateEditMode ? (
            <div className="flex flex-col items-center justify-center gap-0.5 w-full h-full text-[10px] text-muted-foreground select-none pointer-events-none text-center">
              Zona de foto (modo edición plantilla)
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center gap-0.5 cursor-pointer w-full h-full">
              <input type="file" accept="image/*,.heic,.heif" className="sr-only" onChange={(e) => handleFileSelect(index, e.target.files)} />
              <ImagePlus className="size-8 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">+</span>
            </label>
          )
        )}
      </div>
    );
  };

  return (
    <div className="relative flex flex-col lg:flex-row h-screen overflow-hidden">
      {/* Contenedor del sidebar + panel flotante */}
      <div
        data-sidebar-container
        className="hidden lg:flex relative"
      >
        {/* Sidebar de iconos, al estilo Canva */}
        <aside className="flex flex-col w-16 border-r bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 text-foreground">
          <div className="flex-1 flex flex-col items-center gap-2 py-4">
            <button
              type="button"
              className={`group flex h-12 w-12 items-center justify-center rounded-lg hover:bg-primary/10 hover:text-primary transition-all duration-200 hover:scale-105 active:scale-95 ${openPanel === 'config' ? 'bg-primary/10 text-primary' : ''}`}
              title="Configuración del grid"
              onClick={() => {
                // Toggle explícito por click
                setOpenPanel((prev) => (prev === 'config' ? null : 'config'));
              }}
            >
              <Settings className="h-5 w-5 transition-transform group-hover:scale-110" />
            </button>
            <button
              type="button"
              className={`group flex h-12 w-12 items-center justify-center rounded-lg hover:bg-primary/10 hover:text-primary transition-all duration-200 hover:scale-105 active:scale-95 ${openPanel === 'library' ? 'bg-primary/10 text-primary' : ''}`}
              title="Uploads / Biblioteca de fotos"
              onClick={() => {
                setOpenPanel((prev) => (prev === 'library' ? null : 'library'));
              }}
            >
              <ImagePlus className="h-5 w-5 transition-transform group-hover:scale-110" />
            </button>
            <button
              type="button"
              className={`group flex h-12 w-12 items-center justify-center rounded-lg hover:bg-primary/10 hover:text-primary transition-all duration-200 hover:scale-105 active:scale-95 ${openPanel === 'gridmaker' ? 'bg-primary/10 text-primary' : ''}`}
              title="Grid Maker — diseñar plantilla de celda"
              onClick={() => {
                setOpenPanel((prev) => (prev === 'gridmaker' ? null : 'gridmaker'));
              }}
            >
              <Layout className="h-5 w-5 transition-transform group-hover:scale-110" />
            </button>
          </div>

          {/* Logo + nombre/versión de la app */}
          <div className="pb-4 flex items-center justify-center">
            <button
              type="button"
              className="group flex flex-col items-center gap-1"
              title={`${APP_NAME} v${APP_VERSION}`}
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/70 bg-background shadow-sm group-hover:border-primary/60 group-hover:shadow-md transition-colors">
                <img
                  src="/icon.svg"
                  alt={APP_NAME}
                  className="h-5 w-5"
                  draggable={false}
                />
              </div>
              <span className="text-[9px] text-muted-foreground group-hover:text-foreground leading-none">
                v{APP_VERSION}
              </span>
            </button>
          </div>
        </aside>

        {/* Panel flotante de configuración */}
        {openPanel === 'config' && (
          <div
            className="absolute left-16 top-0 bottom-0 w-96 border-r bg-background shadow-2xl z-20 flex flex-col animate-in slide-in-from-left-2 duration-200 overflow-y-auto"
            onMouseEnter={handlePanelCancelClose}
          >
            <Card className="flex-1 border-0 shadow-none">
              <CardHeader className="flex flex-row items-start justify-between gap-2">
                <div className="flex-1">
                  <CardTitle className="text-xl">Configuración del grid</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    Configura el tamaño de hoja, grid, celdas y opciones de exportación.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpenPanel(null)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  aria-label="Cerrar panel de configuración"
                >
                  <X className="h-4 w-4" />
                </button>
              </CardHeader>
              <CardContent 
                className="space-y-6"
                onMouseEnter={handlePanelCancelClose}
                onMouseDown={(e) => {
                  // No interferir con drag and drop
                  const target = e.target as HTMLElement;
                  if (!target.closest('[draggable="true"]')) {
                    handlePanelInteractionStart(e);
                  }
                }}
                onClick={(e) => {
                  // No interferir con drag and drop
                  const target = e.target as HTMLElement;
                  if (!target.closest('[draggable="true"]')) {
                    handlePanelInteractionStart(e);
                  }
                }}
                onFocus={handlePanelInteractionStart}
                onBlur={handlePanelInteractionEnd}
              >
                {/* Formato de celda: plantillas incluidas + las que crees en Grid Maker */}
                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-muted-foreground">Formato de celda</h3>
                  <div className="space-y-2">
                    <Label>Plantilla</Label>
                    <Select
                      value={selectedCardTemplateId || "none"}
                      onValueChange={(v) => {
                        if (v === "none") {
                          setSelectedCardTemplateId(null);
                        } else {
                          setSelectedCardTemplateId(v);
                        }
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Selecciona formato" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Ninguno (grid normal)</SelectItem>
                        {getAllTemplates().map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Las plantillas propias se crean en Grid Maker (icono de cuadrícula).
                    </p>
                  </div>
                </div>

                {/* Inicio rápido: solo lo esencial */}
                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-muted-foreground">Inicio rápido</h3>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Tamaño de hoja</Label>
                      <Select
                        value={pagePreset}
                        onValueChange={(v) => setPagePreset(v as PagePresetId)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(PAGE_PRESETS).map(([id, p]) => (
                            <SelectItem key={id} value={id}>
                              {p.name}
                            </SelectItem>
                          ))}
                          <SelectItem value="custom">Personalizado</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Orientación</Label>
                      <Select
                        value={pageOrientation}
                        onValueChange={(v) => setPageOrientation(v as PageOrientation)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="portrait">Vertical</SelectItem>
                          <SelectItem value="landscape">Horizontal</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-start gap-2 pt-1">
                      <input
                        type="checkbox"
                        id="flexible-layout"
                        checked={useFlexibleLayout}
                        onChange={(e) => setUseFlexibleLayout(e.target.checked)}
                        className="h-4 w-4 rounded border-border mt-0.5"
                      />
                      <Label htmlFor="flexible-layout" className="cursor-pointer text-sm leading-tight flex items-center gap-1.5">
                        Layout inteligente (celdas por fila)
                        <div className="relative group/help shrink-0">
                          <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/help:block z-50">
                            <div className="bg-popover text-popover-foreground text-xs rounded-md border border-border shadow-lg px-3 py-2 max-w-xs whitespace-normal">
                              Se coloca el máximo de fotos del tamaño indicado; algunas en horizontal y otras en vertical según convenga. Si no caben, se colocan las que quepan.
                              <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px">
                                <div className="border-4 border-transparent border-t-popover"></div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </Label>
                    </div>
                    {!useFlexibleLayout && (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Filas</Label>
                          <Input
                            type="number"
                            min={1}
                            max={20}
                            value={formatDisplayNum(rows)}
                            onChange={(e) => setRows(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                            className="w-full"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Columnas</Label>
                          <Input
                            type="number"
                            min={1}
                            max={20}
                            value={formatDisplayNum(cols)}
                            onChange={(e) => setCols(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                            className="w-full"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Opciones de hoja (colapsable) */}
                <details className="group rounded-lg border border-border bg-muted/10">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 font-medium text-sm hover:bg-muted/20 [&::-webkit-details-marker]:hidden">
              <span className="transition group-open:rotate-90">▶</span>
              Opciones de hoja
            </summary>
            <div className="border-t border-border px-4 py-4 space-y-4">
              {pagePreset === "custom" && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Ancho</Label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        min={1}
                        step={0.1}
                        value={formatDisplayNum(customPageWidth)}
                        onChange={(e) => setCustomPageWidth(Number(e.target.value) || 0)}
                        className="flex-1"
                      />
                      <Select
                        value={customPageUnit}
                        onValueChange={(v) => setCustomPageUnit(v as LengthUnit)}
                      >
                        <SelectTrigger className="w-20">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {UNITS.map((u) => (
                            <SelectItem key={u} value={u}>
                              {UNIT_LABELS[u]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Alto</Label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        min={1}
                        step={0.1}
                        value={formatDisplayNum(customPageHeight)}
                        onChange={(e) => setCustomPageHeight(Number(e.target.value) || 0)}
                        className="flex-1"
                      />
                      <span className="flex items-center text-sm text-muted-foreground px-3">
                        {UNIT_LABELS[customPageUnit]}
                      </span>
                    </div>
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <Label>Margen (hoja)</Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min={0}
                    step={0.5}
                    value={formatDisplayNum(marginValue)}
                    onChange={(e) => setMarginValue(Number(e.target.value) || 0)}
                    className="flex-1"
                  />
                  <Select
                    value={marginUnit}
                    onValueChange={(v) => setMarginUnit(v as LengthUnit)}
                  >
                    <SelectTrigger className="w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {UNITS.map((u) => (
                        <SelectItem key={u} value={u}>
                          {UNIT_LABELS[u]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Número de hojas</Label>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={formatDisplayNum(sheetCount)}
                  onChange={(e) =>
                    setSheetCount(Math.max(1, Math.min(50, Number(e.target.value) || 1)))
                  }
                  className="w-full"
                />
              </div>
            </div>
                </details>

                {/* Reglas y guías (colapsable) */}
                <details className="group rounded-lg border border-border bg-muted/10">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 font-medium text-sm hover:bg-muted/20 [&::-webkit-details-marker]:hidden">
              <span className="transition group-open:rotate-90">▶</span>
              Reglas y guías
            </summary>
            <div className="border-t border-border px-4 py-4 space-y-4">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="show-rulers"
                  checked={showRulers}
                  onChange={(e) => setShowRulers(e.target.checked)}
                  className="size-4 rounded border-input"
                />
                <Label htmlFor="show-rulers" className="cursor-pointer font-medium">
                  Mostrar reglas
                </Label>
              </div>
              {showRulers && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="show-guides-in-export"
                      checked={showGuidesInExport}
                      onChange={(e) => setShowGuidesInExport(e.target.checked)}
                      className="size-4 rounded border-input"
                    />
                    <Label htmlFor="show-guides-in-export" className="cursor-pointer text-sm">
                      Mostrar guías en el export
                    </Label>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <p>Arrastra desde las reglas (áreas grises) para crear guías. Arrastra una guía para moverla.</p>
                    <p className="mt-1">Eliminar: pasa el mouse sobre una guía y haz clic en el botón X, o clic derecho.</p>
                    <p className="mt-1 font-medium">Guías activas: {guides.length}</p>
                  </div>
                </div>
              )}
            </div>
          </details>

          {!fitResult.fits && (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              <AlertTriangle className="size-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">
                  El grid no cabe en la hoja
                </p>
                <p className="mt-1 text-destructive/90">
                  Área útil: {fitResult.usableWidthMm.toFixed(0)} × {fitResult.usableHeightMm.toFixed(0)} mm. Grid: {fitResult.gridWidthMm.toFixed(0)} × {fitResult.gridHeightMm.toFixed(0)} mm.
                  {fitResult.overflowWidthMm != null && (
                    <span className="block mt-0.5">
                      Sobra en ancho: {fitResult.overflowWidthMm.toFixed(0)} mm (≈ {(fitResult.overflowWidthMm / 25.4).toFixed(1)} pulg).
                    </span>
                  )}
                  {fitResult.overflowHeightMm != null && (
                    <span className="block mt-0.5">
                      Sobra en alto: {fitResult.overflowHeightMm.toFixed(0)} mm (≈ {(fitResult.overflowHeightMm / 25.4).toFixed(1)} pulg).
                    </span>
                  )}
                  Reduce el número de filas/columnas, el tamaño de celda o el margen para que quepa.
                </p>
              </div>
            </div>
          )}


                <p className="text-sm text-muted-foreground">
                  {cellCount} posición{cellCount !== 1 ? "es" : ""} en total
                  {sheetCount > 1 ? ` (${sheetCount} hojas)` : ""}. El preview está a tamaño real.
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Panel flotante de biblioteca */}
        {openPanel === "gridmaker" && (
          <div
            data-sidebar-container
            className="absolute left-16 top-0 bottom-0 w-96 border-r bg-background shadow-2xl z-20 flex flex-col animate-in slide-in-from-left-2 duration-200 overflow-y-auto"
          >
            <div className="flex items-center justify-between px-4 pt-3 pb-1 border-b bg-background/80">
              <span className="text-sm font-medium text-muted-foreground">Grid Maker</span>
              <button
                type="button"
                onClick={() => setOpenPanel(null)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                aria-label="Cerrar Grid Maker"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <GridMakerPanel
              selectedTemplateId={selectedCardTemplateId}
              onSelectTemplate={setSelectedCardTemplateId}
              onEditingTemplateChange={setEditingTemplateFromGridMaker}
              onRegisterExitEdit={(fn) => {
                exitTemplateEditRef.current = fn;
              }}
              initialEditingTemplate={editingTemplateFromGridMaker}
              sheetLayout={{
                pageWidthMm: layout.pageWidthMm,
                pageHeightMm: layout.pageHeightMm,
                marginMm: layout.marginMm,
              }}
            />
          </div>
        )}
        {openPanel === 'library' && (
          <div
            className="absolute left-16 top-0 bottom-0 w-72 border-r bg-background shadow-2xl z-20 flex flex-col animate-in slide-in-from-left-2 duration-200"
            onMouseEnter={handlePanelCancelClose}
          >
            <Card className="flex-1 border-0 shadow-none">
              <CardHeader className="flex flex-row items-start justify-between gap-2">
                <div className="flex-1">
                  <CardTitle className="text-lg">Biblioteca de fotos</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Arrastra aquí muchas fotos o haz clic para cargarlas, y luego arrástralas a las celdas del grid.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpenPanel(null)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  aria-label="Cerrar biblioteca"
                >
                  <X className="h-4 w-4" />
                </button>
              </CardHeader>
              <CardContent 
                className="space-y-3"
                onMouseEnter={handlePanelCancelClose}
                onFocus={handlePanelInteractionStart}
                onBlur={handlePanelInteractionEnd}
              >
                <div
                  className={cn(
                    "relative flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-md px-4 py-6 text-center transition",
                    libraryLoading
                      ? "border-primary/50 bg-primary/5 cursor-wait"
                      : "border-muted-foreground/40 cursor-pointer hover:border-primary/70 hover:bg-muted/40"
                  )}
                  onDrop={handleLibraryDrop}
                  onDragOver={handleLibraryDragOver}
                >
                  {libraryLoading ? (
                    <div className="flex flex-col items-center gap-2 pointer-events-none">
                      <Loader2 className="w-8 h-8 text-primary animate-spin" />
                      <span className="text-sm font-medium text-foreground">
                        Cargando fotos…
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Procesando imágenes (puede tardar en HEIC)
                      </span>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center gap-1 cursor-pointer">
                      <input
                        type="file"
                        accept="image/*,.heic,.heif"
                        multiple
                        className="sr-only"
                        onChange={handleLibraryFileInput}
                        ref={libraryFileInputRef}
                      />
                      <ImagePlus className="w-7 h-7 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">
                        Arrastra aquí fotos o haz clic para seleccionar varias
                      </span>
                    </label>
                  )}
                </div>

                {libraryPhotos.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {libraryPhotos.length} foto
                        {libraryPhotos.length !== 1 ? "s" : ""} cargada
                        {libraryPhotos.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 max-h-64 overflow-auto">
                      {libraryPhotos.map((photo, idx) => (
                        <div
                          key={idx}
                          className="relative group bg-muted rounded overflow-hidden border border-border/60 cursor-grab active:cursor-grabbing"
                          draggable={true}
                          onDragStart={(e) => {
                            // No iniciar drag si se hace click en el botón de eliminar
                            const target = e.target as HTMLElement;
                            if (target.closest('button')) {
                              e.preventDefault();
                              return;
                            }
                            handleLibraryDragStart(idx, e);
                          }}
                          onDragEnd={(e) => {
                            // Limpiar el estado de drag activo cuando termine el drag
                            isLibraryDragActiveRef.current = false;
                            isInteractingRef.current = false;
                          }}
                          title={photo.fileName ?? "Arrastra al grid para usar esta foto"}
                        >
                          <img
                            src={photo.url}
                            alt={photo.fileName ?? ""}
                            className="w-full h-16 object-cover pointer-events-none select-none"
                            draggable={false}
                          />
                          <button
                            type="button"
                            className="absolute top-1 right-1 rounded-full bg-black/70 text-white p-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              removeLibraryPhoto(idx);
                            }}
                            onMouseDown={(e) => {
                              e.stopPropagation();
                            }}
                            title="Quitar de la biblioteca"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Contenido principal (solo preview) */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Preview a tamaño real: hoja en mm */}
        <Card className="flex-1 flex flex-col overflow-hidden m-0 rounded-none border-0">
          <CardHeader className="shrink-0 border-b flex flex-row items-center justify-between gap-4">
            <CardTitle className="text-lg">Vista previa (hoja a tamaño real)</CardTitle>
            {editingTemplateFromGridMaker != null ? (
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-sm text-muted-foreground hidden sm:inline">Editando plantilla</span>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditingTemplateFromGridMaker(null);
                    placeholderUpdaterRef.current = null;
                    exitTemplateEditRef.current?.();
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    if (editingTemplateFromGridMaker) {
                      saveTemplate(editingTemplateFromGridMaker);
                      setSelectedCardTemplateId(editingTemplateFromGridMaker.id);
                    }
                    setEditingTemplateFromGridMaker(null);
                    placeholderUpdaterRef.current = null;
                    exitTemplateEditRef.current?.();
                  }}
                >
                  Aceptar
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                onClick={exportPdf}
                disabled={exporting || !fitResult.fits || !cells.some(Boolean)}
                className="gap-2 shrink-0"
              >
                {exporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                {exporting ? "Exportando…" : "Exportar PDF"}
              </Button>
            )}
          </CardHeader>
        <CardContent className="flex-1 overflow-auto bg-muted/30 p-4 flex justify-center items-start">
          <div className="flex flex-col items-center gap-8 relative" style={{ transformOrigin: "top center" }}>
            {Array.from({ length: sheetCount }, (_, sheetIndex) => (
              <div key={sheetIndex} className="flex flex-col items-center gap-1 relative">
                {sheetCount > 1 && (
                  <span className="text-sm font-medium text-muted-foreground">Hoja {sheetIndex + 1}</span>
                )}
                <div
                  data-page-preview
                  className="bg-white shadow-lg flex flex-col relative"
                  style={{
                    width: `${layout.pageWidthMm}mm`,
                    minWidth: `${layout.pageWidthMm}mm`,
                    height: `${layout.pageHeightMm}mm`,
                    minHeight: `${layout.pageHeightMm}mm`,
                  }}
                >
                  {/* Reglas */}
                  {showRulers && (
                    <>
                      {/* Regla horizontal superior */}
                      <div
                        className="absolute -top-6 left-0 right-0 h-6 bg-muted/80 border-b border-border flex items-end text-[10px] text-muted-foreground select-none"
                        style={{ width: `${layout.pageWidthMm}mm` }}
                      >
                        {Array.from({ length: Math.floor(layout.pageWidthMm / 10) + 1 }, (_, i) => {
                          const posMm = i * 10;
                          if (posMm > layout.pageWidthMm) return null;
                          return (
                            <div
                              key={i}
                              className="absolute border-l border-border"
                              style={{
                                left: `${(posMm / layout.pageWidthMm) * 100}%`,
                                height: posMm % 50 === 0 ? "100%" : "50%",
                              }}
                            >
                              {posMm % 50 === 0 && (
                                <span className="absolute -left-2 -bottom-4 text-[8px]">{posMm}</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {/* Regla vertical izquierda */}
                      <div
                        className="absolute top-0 -left-6 w-6 bg-muted/80 border-r border-border flex flex-col items-end text-[10px] text-muted-foreground select-none"
                        style={{ height: `${layout.pageHeightMm}mm` }}
                      >
                        {Array.from({ length: Math.floor(layout.pageHeightMm / 10) + 1 }, (_, i) => {
                          const posMm = i * 10;
                          if (posMm > layout.pageHeightMm) return null;
                          return (
                            <div
                              key={i}
                              className="absolute border-t border-border"
                              style={{
                                top: `${(posMm / layout.pageHeightMm) * 100}%`,
                                width: posMm % 50 === 0 ? "100%" : "50%",
                              }}
                            >
                              {posMm % 50 === 0 && (
                                <span className="absolute -right-6 -top-2 text-[8px] transform -rotate-90 origin-center whitespace-nowrap">
                                  {posMm}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {/* Área arrastrable para crear guías horizontales */}
                      <div
                        className="absolute -top-8 left-0 right-0 h-8 cursor-crosshair z-20 hover:bg-blue-100/20 transition-colors"
                        style={{ width: `${layout.pageWidthMm}mm` }}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          handleRulerMouseDown(e, "horizontal");
                        }}
                        title="Arrastra para crear guía horizontal"
                      />
                      {/* Área arrastrable para crear guías verticales */}
                      <div
                        className="absolute top-0 -left-8 w-8 cursor-crosshair z-20 hover:bg-blue-100/20 transition-colors"
                        style={{ height: `${layout.pageHeightMm}mm` }}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          handleRulerMouseDown(e, "vertical");
                        }}
                        title="Arrastra para crear guía vertical"
                      />
                    </>
                  )}
                  {/* Guías */}
                  {showRulers && guides.map((guide) => {
                    const isHorizontal = guide.orientation === "horizontal";
                    return (
                      <div
                        key={guide.id}
                        className={`absolute z-30 cursor-move group ${
                          isHorizontal ? "w-full h-0 border-t border-dashed border-blue-500" : "h-full w-0 border-l border-dashed border-blue-500"
                        }`}
                        style={{
                          [isHorizontal ? "top" : "left"]: `${(guide.positionMm / (isHorizontal ? layout.pageHeightMm : layout.pageWidthMm)) * 100}%`,
                        }}
                        onMouseDown={(e) => {
                          // No iniciar arrastre si se hace clic en el botón de eliminar
                          if ((e.target as HTMLElement).closest('.guide-delete-btn')) {
                            return;
                          }
                          handleGuideMouseDown(e, guide.id, guide.orientation);
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          removeGuide(guide.id);
                        }}
                        title="Arrastra para mover, clic derecho o botón X para eliminar"
                      >
                        <div
                          className={`absolute bg-blue-500 opacity-0 group-hover:opacity-100 transition-opacity ${
                            isHorizontal ? "w-3 h-3 -left-1.5 -top-1.5 rounded-full" : "w-3 h-3 -left-1.5 -top-1.5 rounded-full"
                          }`}
                        />
                        {/* Botón de eliminar */}
                        <button
                          className="guide-delete-btn absolute bg-red-500 hover:bg-red-600 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-40 shadow-sm"
                          style={{
                            [isHorizontal ? "left" : "top"]: "4px",
                            [isHorizontal ? "top" : "left"]: "-12px",
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            removeGuide(guide.id);
                          }}
                          title="Eliminar guía"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                  <div
                    className={cn(
                      "flex flex-col overflow-auto",
                      (templateCellRects?.length || (useFlexibleLayout && flexibleLayout)) ? "flex-none" : "flex-1"
                    )}
                    style={{
                      padding: (templateCellRects?.length || (useFlexibleLayout && flexibleLayout)) ? 0 : `${layout.marginMm}mm`,
                      position: (templateCellRects?.length || (useFlexibleLayout && flexibleLayout)) ? "relative" : undefined,
                      width: (templateCellRects?.length || (useFlexibleLayout && flexibleLayout)) ? `${layout.pageWidthMm}mm` : undefined,
                      height: (templateCellRects?.length || (useFlexibleLayout && flexibleLayout)) ? `${layout.pageHeightMm}mm` : undefined,
                    }}
                  >
                    {templateCellRects && templateCellRects.length > 0 && templateCardRects && effectiveCardTemplate ? (
                      <>
                        {templateCardRects.map((cardRect, cellInSheet) => {
                          const index = sheetIndex * cellsPerSheet + cellInSheet;
                          const rect = templateCellRects[cellInSheet];
                          const rawPh = effectiveCardTemplate.placeholders[0];
                          if (!rect || !rawPh) return null;
                          const outerB = effectiveCardTemplate.outerBorder;
                          const innerB = effectiveCardTemplate.innerBorder;
                          const borderColor = "hsl(0, 0%, 25%)";
                          const isEditingTemplate = editingTemplateFromGridMaker != null;
                          const imgLeftMm = rect.xMm - cardRect.xMm;
                          const imgTopMm = rect.yMm - cardRect.yMm;
                          const isRotated = !!cardRect.rotated;
                          const outerPx = outerB?.enabled ? mmToPx(outerB.widthMm) : 1;
                          const innerPx = innerB?.enabled ? mmToPx(innerB.widthMm) : 0;
                          return (
                            <div
                              key={cellInSheet}
                              data-template-card
                              className="absolute bg-white"
                              style={{
                                left: `${cardRect.xMm}mm`,
                                top: `${cardRect.yMm}mm`,
                                width: `${cardRect.widthMm}mm`,
                                height: `${cardRect.heightMm}mm`,
                                boxSizing: "content-box",
                                boxShadow: outerB?.enabled
                                  ? `inset 0 0 0 ${outerPx}px ${borderColor}`
                                  : "inset 0 0 0 1px hsl(var(--muted-foreground) / 0.4)",
                              }}
                            >
                              <div
                                className={cn(
                                  "absolute overflow-hidden",
                                  isEditingTemplate && "cursor-move"
                                )}
                                style={{
                                  left: `${imgLeftMm}mm`,
                                  top: `${imgTopMm}mm`,
                                  width: `${rect.widthMm}mm`,
                                  height: `${rect.heightMm}mm`,
                                  boxSizing: "content-box",
                                  ...(innerPx > 0 ? { boxShadow: `inset 0 0 0 ${innerPx}px ${borderColor}` } : {}),
                                }}
                                {...(isEditingTemplate && !isRotated
                                  ? {
                                      title: "Arrastra para mover la zona de la foto",
                                      onMouseDown: (e: React.MouseEvent) =>
                                        handlePlaceholderDragStart(e, cardRect.widthMm, rawPh),
                                    }
                                  : {})}
                              >
                                {isRotated && cells[index] ? (
                                  <div
                                    className="absolute overflow-hidden"
                                    style={{
                                      width: `${rect.heightMm}mm`,
                                      height: `${rect.widthMm}mm`,
                                      left: `${(rect.widthMm - rect.heightMm) / 2}mm`,
                                      top: `${(rect.heightMm - rect.widthMm) / 2}mm`,
                                      transform: "rotate(-90deg)",
                                      transformOrigin: "center center",
                                    }}
                                  >
                                    {renderCell(index, rect.heightMm, rect.widthMm, { disableBorders: true, cellRotated: true, hideActionButtons: true })}
                                  </div>
                                ) : (
                                  renderCell(index, rect.widthMm, rect.heightMm, { disableBorders: true })
                                )}
                              </div>
                              {isRotated && cells[index] && (
                                <div
                                  className="absolute flex gap-1 z-20"
                                  style={{
                                    top: `${imgTopMm + 2}mm`,
                                    right: `${cardRect.widthMm - imgLeftMm - rect.widthMm + 2}mm`,
                                  }}
                                >
                                  <Button type="button" size="icon" variant={selectedCellIndex === index ? "default" : "secondary"} className="size-7 opacity-90 hover:opacity-100" onClick={(e) => { e.stopPropagation(); setSelectedCellIndex((prev) => (prev === index ? null : index)); }} title={selectedCellIndex === index ? "Cerrar edición" : "Editar imagen"}>
                                    <Pencil className="size-3.5" />
                                  </Button>
                                  <Button type="button" size="icon" variant="destructive" className="size-7 opacity-80 hover:opacity-100" onClick={(e) => { e.stopPropagation(); clearCell(index); }}>
                                    <Trash2 className="size-4" />
                                  </Button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </>
                    ) : useFlexibleLayout && flexibleLayout ? (
                      <>
                        {flexibleLayout.cellRects.map((rect, cellInSheet) => {
                          const index = sheetIndex * cellsPerSheet + cellInSheet;
                          return (
                            <div
                              key={cellInSheet}
                              className="absolute overflow-hidden"
                              style={{
                                left: `${rect.xMm}mm`,
                                top: `${rect.yMm}mm`,
                                width: `${rect.widthMm}mm`,
                                height: `${rect.heightMm}mm`,
                              }}
                            >
                              {renderCell(index, rect.widthMm, rect.heightMm)}
                            </div>
                          );
                        })}
                      </>
                    ) : (
                      <div
                        className="grid overflow-hidden"
                        style={{
                          gridTemplateColumns: `repeat(${layout.cols}, ${layout.cellWidthMm}mm)`,
                          gridTemplateRows: `repeat(${layout.rows}, ${layout.cellHeightMm}mm)`,
                          gap: `${layout.gapMm}mm`,
                        }}
                      >
                        {Array.from({ length: cellsPerSheet }, (_, cellInSheet) => {
                          const index = sheetIndex * cellsPerSheet + cellInSheet;
                          return renderCell(index, layout.cellWidthMm, layout.cellHeightMm);
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      </div>

      {/* Toolbar flotante de edición (estilo Figma) */}
      {selectedCellIndex !== null && cells[selectedCellIndex] && (
        <div
          className={cn(
            "fixed bottom-6 left-1/2 z-50",
            "bg-background/95 backdrop-blur-md border border-border rounded-lg shadow-2xl",
            "px-6 py-4 flex items-center gap-6"
          )}
          style={{
            animation: "toolbarSlideIn 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards"
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">
              Celda {selectedCellIndex + 1}
            </span>
          </div>

          <div className="h-8 w-px bg-border" />

          {/* Controles de Escala */}
          <div className="flex items-center gap-3">
            <Label className="text-sm font-medium whitespace-nowrap">Escala</Label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={50}
                max={200}
                value={Math.round(getPhotoEdit(cells[selectedCellIndex]!).scale * 100)}
                onChange={(e) =>
                  updatePhotoEdit(selectedCellIndex, {
                    scale: Number(e.target.value) / 100,
                  })
                }
                className="w-32 h-2 rounded-lg appearance-none cursor-pointer bg-muted accent-primary"
              />
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  min={50}
                  max={200}
                  step={1}
                  className="w-16 h-8 text-sm text-center"
                  value={editingScaleInput[selectedCellIndex] ?? formatDisplayNum(Math.round(getPhotoEdit(cells[selectedCellIndex]!).scale * 100))}
                  onFocus={() => setEditingScaleInput((p) => ({ ...p, [selectedCellIndex]: String(Math.round(getPhotoEdit(cells[selectedCellIndex]!).scale * 100)) }))}
                  onChange={(e) => setEditingScaleInput((p) => ({ ...p, [selectedCellIndex]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      applyScaleValue(selectedCellIndex);
                      e.currentTarget.blur();
                    }
                  }}
                  onBlur={() => {
                    const raw = editingScaleInput[selectedCellIndex];
                    if (raw === undefined) return;
                    const v = parseFloat(raw);
                    if (!Number.isNaN(v)) updatePhotoEdit(selectedCellIndex, { scale: Math.max(0.5, Math.min(2, v / 100)) });
                    setEditingScaleInput((p) => {
                      const n = { ...p };
                      delete n[selectedCellIndex];
                      return n;
                    });
                  }}
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            </div>
          </div>

          <div className="h-8 w-px bg-border" />

          {/* Controles de Rotación */}
          <div className="flex items-center gap-3">
            <Label className="text-sm font-medium whitespace-nowrap">Rotación</Label>
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="size-9 shrink-0"
              title="Rotar 90° en sentido antihorario"
              onClick={() => {
                const current = getPhotoEdit(cells[selectedCellIndex]!).rotation;
                let next = current - 90;
                if (next < -180) next += 360;
                updatePhotoEdit(selectedCellIndex, { rotation: next });
                setEditingRotationInput((p) => ({ ...p, [selectedCellIndex]: String(next) }));
              }}
            >
              <RotateCcw className="size-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="size-9 shrink-0"
              title="Rotar 90° en sentido horario"
              onClick={() => {
                const current = getPhotoEdit(cells[selectedCellIndex]!).rotation;
                let next = current + 90;
                if (next > 180) next -= 360;
                updatePhotoEdit(selectedCellIndex, { rotation: next });
                setEditingRotationInput((p) => ({ ...p, [selectedCellIndex]: String(next) }));
              }}
            >
              <RotateCw className="size-4" />
            </Button>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={-180}
                max={180}
                value={getPhotoEdit(cells[selectedCellIndex]!).rotation}
                onChange={(e) =>
                  updatePhotoEdit(selectedCellIndex, {
                    rotation: Number(e.target.value),
                  })
                }
                className="w-32 h-2 rounded-lg appearance-none cursor-pointer bg-muted accent-primary"
              />
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  min={-180}
                  max={180}
                  step={0.5}
                  className="w-16 h-8 text-sm text-center"
                  value={editingRotationInput[selectedCellIndex] ?? formatDisplayNum(getPhotoEdit(cells[selectedCellIndex]!).rotation)}
                  onFocus={() => setEditingRotationInput((p) => ({ ...p, [selectedCellIndex]: String(getPhotoEdit(cells[selectedCellIndex]!).rotation) }))}
                  onChange={(e) => setEditingRotationInput((p) => ({ ...p, [selectedCellIndex]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      applyRotationValue(selectedCellIndex);
                      e.currentTarget.blur();
                    }
                  }}
                  onBlur={() => {
                    const raw = editingRotationInput[selectedCellIndex];
                    if (raw === undefined) return;
                    const v = parseFloat(raw);
                    if (!Number.isNaN(v)) updatePhotoEdit(selectedCellIndex, { rotation: Math.max(-180, Math.min(180, v)) });
                    setEditingRotationInput((p) => {
                      const n = { ...p };
                      delete n[selectedCellIndex];
                      return n;
                    });
                  }}
                />
                <span className="text-sm text-muted-foreground">°</span>
              </div>
            </div>
          </div>

          <div className="h-8 w-px bg-border" />

          {/* Pantalla completa */}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="whitespace-nowrap flex items-center gap-2"
            onClick={() => {
              if (selectedCellIndex !== null) {
                setFullscreenIndex(selectedCellIndex);
              }
            }}
            title="Pantalla completa"
          >
            <Maximize2 className="size-4" />
          </Button>

          <div className="h-8 w-px bg-border" />

          {/* Botón de cerrar */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setSelectedCellIndex(null)}
            className="whitespace-nowrap"
          >
            Listo
          </Button>
        </div>
      )}
      {/* Overlay de foto en pantalla completa (respeta encuadre de la celda) */}
      {fullscreenIndex !== null && cells[fullscreenIndex] && (() => {
        const index = fullscreenIndex;
        const photo = cells[index]!;
        const edit = getPhotoEdit(photo);
        const { widthMm, heightMm } = getCellDimensionsMm(index);
        const aspectRatio = widthMm > 0 && heightMm > 0 ? widthMm / heightMm : 1;

        return (
          <div
            className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
            onClick={() => setFullscreenIndex(null)}
          >
            <button
              type="button"
              className="absolute top-4 right-4 inline-flex items-center justify-center rounded-full bg-black/70 text-white hover:bg-black/90 transition-colors p-2"
              onClick={(e) => {
                e.stopPropagation();
                setFullscreenIndex(null);
              }}
              aria-label="Cerrar pantalla completa"
            >
              <X className="size-5" />
            </button>
            <div
              className="flex items-center justify-center"
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="relative rounded-lg shadow-2xl overflow-hidden flex items-center justify-center"
                style={{
                  maxWidth: "95vw",
                  maxHeight: "90vh",
                  width: `min(95vw, calc(90vh * ${aspectRatio}))`,
                  aspectRatio: `${widthMm} / ${heightMm}`,
                }}
              >
                <div className="absolute inset-0">
                  <div
                    className="absolute left-1/2 top-1/2 origin-center"
                    style={{
                      width: "100%",
                      height: "100%",
                      transformOrigin: "center center",
                      transform: (() => {
                        const tx = edit.panX * 50;
                        const ty = edit.panY * 50;
                        return `translate(-50%, -50%) translate(${tx}%, ${ty}%) rotate(${edit.rotation}deg) scale(${edit.scale})`;
                      })(),
                    }}
                  >
                    <div className="absolute inset-0">
                      <img
                        src={photo.url}
                        alt={photo.fileName ?? `Foto ${index + 1}`}
                        className="w-full h-full object-contain pointer-events-none select-none"
                        draggable={false}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="absolute bottom-6 flex items-center gap-3 px-4 py-2 rounded-full bg-black/60 text-sm text-white/90">
              <span>Celda {index + 1}</span>
              <span className="text-xs text-white/70">Usa ← → para cambiar de foto, Esc para salir</span>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
