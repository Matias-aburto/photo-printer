"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, Plus, Trash2, Copy, Layout } from "lucide-react";
import type { CardTemplate, PlaceholderRect, TemplateBorder, TemplateBorderStyle } from "@/types/card-template";
import { normalizePlaceholder } from "@/types/card-template";
import { toMm, fromMm, type LengthUnit, UNIT_LABELS } from "@/lib/units";
import { formatDisplayNum } from "@/lib/utils";
import {
  getAllTemplates,
  getTemplateById,
  saveTemplate,
  deleteTemplate,
  createNewTemplate,
} from "@/lib/card-templates";

interface GridMakerPanelProps {
  onSelectTemplate: (templateId: string | null) => void;
  selectedTemplateId: string | null;
  /** Cuando el usuario está editando una plantilla, se notifica aquí para que la vista previa principal la muestre en vivo. */
  onEditingTemplateChange?: (template: CardTemplate | null) => void;
  /** Registra una función para salir del modo edición desde fuera (p. ej. botones Aceptar/Cancelar del header). */
  onRegisterExitEdit?: (fn: (() => void) | null) => void;
  /** Plantilla en edición que mantiene el padre; al reabrir el panel se restaura para no perder el modo edición. */
  initialEditingTemplate?: CardTemplate | null;
  /** Tamaño de la hoja actual para mostrar alerta si la plantilla no cabe. */
  sheetLayout?: { pageWidthMm: number; pageHeightMm: number; marginMm: number };
}

export function GridMakerPanel({ onSelectTemplate, selectedTemplateId, onEditingTemplateChange, onRegisterExitEdit, initialEditingTemplate, sheetLayout }: GridMakerPanelProps) {
  const [templates, setTemplates] = useState<CardTemplate[]>([]);
  const [editing, setEditing] = useState<CardTemplate | null>(null);
  const [frameUnit, setFrameUnit] = useState<LengthUnit>("mm");
  // Evitar que el valor formateado mueva el cursor: edición libre y commit al salir
  const [focusedNumberField, setFocusedNumberField] = useState<string | null>(null);
  const [editingNumberValue, setEditingNumberValue] = useState("");

  const numberInputProps = useCallback(
    (fieldId: string, currentFormatted: string, onCommit: (value: number) => void) => ({
      type: "text" as const,
      inputMode: "decimal" as const,
      value: focusedNumberField === fieldId ? editingNumberValue : currentFormatted,
      onFocus: () => {
        setFocusedNumberField(fieldId);
        setEditingNumberValue(currentFormatted);
      },
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
        if (focusedNumberField === fieldId) setEditingNumberValue(e.target.value);
      },
      onBlur: (e: React.FocusEvent<HTMLInputElement>) => {
        if (focusedNumberField !== fieldId) return;
        const raw = e.target.value.trim().replace(",", ".");
        const v = raw === "" ? NaN : parseFloat(raw);
        if (!Number.isNaN(v)) onCommit(v);
        setFocusedNumberField(null);
        setEditingNumberValue("");
      },
    }),
    [focusedNumberField, editingNumberValue]
  );

  const refreshTemplates = useCallback(() => {
    setTemplates(getAllTemplates());
  }, []);

  useEffect(() => {
    refreshTemplates();
  }, [refreshTemplates]);

  // Restaurar modo edición al reabrir el panel si el padre sigue en modo edición (p. ej. se cerró el panel al hacer click en la vista previa)
  useEffect(() => {
    if (initialEditingTemplate != null && editing === null) {
      const normalized: CardTemplate = {
        ...initialEditingTemplate,
        placeholders: initialEditingTemplate.placeholders.map((p) =>
          normalizePlaceholder(p, initialEditingTemplate.widthMm, initialEditingTemplate.heightMm)
        ),
      };
      setEditing(normalized);
    }
  }, [initialEditingTemplate, editing]);

  const handleNew = useCallback(() => {
    const t = createNewTemplate("Nueva plantilla");
    setEditing(t);
    onSelectTemplate(null);
  }, [onSelectTemplate]);

  const handleEdit = useCallback((id: string) => {
    const t = getTemplateById(id);
    if (t) {
      const copy: CardTemplate = {
        ...t,
        placeholders: t.placeholders.map((p) =>
          normalizePlaceholder(p, t.widthMm, t.heightMm)
        ),
      };
      setEditing(copy);
    }
  }, []);

  const handleDuplicate = useCallback((id: string) => {
    const t = getTemplateById(id);
    if (!t) return;
    const dup: CardTemplate = {
      ...t,
      id: `user:${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name: `Copia de ${t.name}`,
      placeholders: t.placeholders.map((p) => ({ ...p })),
    };
    setEditing(dup);
    saveTemplate(dup);
    refreshTemplates();
  }, [refreshTemplates]);

  const handleDelete = useCallback((id: string) => {
    if (id.startsWith("builtin:")) return;
    deleteTemplate(id);
    refreshTemplates();
    if (editing?.id === id) setEditing(null);
    if (selectedTemplateId === id) onSelectTemplate(null);
  }, [editing?.id, selectedTemplateId, onSelectTemplate, refreshTemplates]);

  const handleSave = useCallback(() => {
    if (!editing) return;
    saveTemplate(editing);
    refreshTemplates();
    setEditing(null);
  }, [editing, refreshTemplates]);

  const handleCancelEdit = useCallback(() => {
    setEditing(null);
  }, []);

  const updateEditing = useCallback((updater: (t: CardTemplate) => CardTemplate) => {
    setEditing((prev) => (prev ? updater(prev) : null));
  }, []);


  const setPlaceholder = useCallback(
    (index: number, patch: Partial<PlaceholderRect>) => {
      updateEditing((t) => {
        const next = [...t.placeholders];
        if (!next[index]) return t;
        next[index] = { ...next[index], ...patch };
        return { ...t, placeholders: next };
      });
    },
    [updateEditing]
  );

  // Notificar al padre la plantilla en edición; el actualizador de márgenes al arrastrar lo gestiona el padre para que siga funcionando si se cierra el panel
  useEffect(() => {
    onEditingTemplateChange?.(editing ?? null);
  }, [editing, onEditingTemplateChange]);

  // Registrar función para que el padre pueda cerrar el modo edición (Aceptar/Cancelar en el header)
  useEffect(() => {
    onRegisterExitEdit?.(editing != null ? () => setEditing(null) : null);
    return () => {
      onRegisterExitEdit?.(null);
    };
  }, [editing, onRegisterExitEdit]);

  const cardW = editing?.widthMm ?? 50;
  const cardH = editing?.heightMm ?? 50;
  const rawPh = editing?.placeholders[0];
  const ph = rawPh ? normalizePlaceholder(rawPh, cardW, cardH) : null;

  return (
    <Card className="flex-1 border-0 shadow-none">
      <CardHeader>
        <CardTitle className="text-xl flex items-center gap-2">
          <Layout className="h-5 w-5" />
          Grid Maker
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Diseña la plantilla de una celda (marco + zona de foto). Esa celda se repetirá en la hoja según el tamaño que elijas.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Lista de plantillas y usar */}
        <div className="space-y-3">
          <div className="flex gap-2 items-center">
            <Label className="shrink-0">Plantillas</Label>
            <Button type="button" variant="outline" size="sm" onClick={handleNew}>
              <Plus className="h-4 w-4 mr-1" />
              Nueva
            </Button>
          </div>
          <Select
            value={selectedTemplateId || "none"}
            onValueChange={(v) => {
              if (v === "none") onSelectTemplate(null);
              else onSelectTemplate(v);
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Selecciona una plantilla" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Ninguna (grid normal)</SelectItem>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedTemplateId && selectedTemplateId !== "none" && (() => {
            const t = getTemplateById(selectedTemplateId);
            if (!t) return null;
            return (
              <div className="flex items-center gap-2 p-2 rounded-lg border bg-muted/30">
                <span className="text-sm font-medium truncate flex-1 min-w-0" title={t.name}>
                  {t.name}
                </span>
                <div className="flex shrink-0 gap-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2"
                    onClick={() => handleEdit(t.id)}
                  >
                    Editar
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2"
                    onClick={() => handleDuplicate(t.id)}
                    title="Duplicar"
                  >
                    <Copy className="h-3.5 w-3" />
                  </Button>
                  {!t.id.startsWith("builtin:") && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(t.id)}
                      title="Eliminar"
                    >
                      <Trash2 className="h-3.5 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })()}
        </div>

        {/* Editor de plantilla */}
        {editing && (
          <div className="space-y-4 rounded-lg border p-4 bg-muted/30">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <Label className="text-sm font-medium">Editando: {editing.name}</Label>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={handleCancelEdit}>
                  Cancelar
                </Button>
                <Button type="button" size="sm" onClick={handleSave}>
                  Guardar
                </Button>
              </div>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm">Nombre</Label>
                <Input
                  className="w-full min-w-0"
                  value={editing.name}
                  onChange={(e) => updateEditing((t) => ({ ...t, name: e.target.value }))}
                  placeholder="Nombre de la plantilla"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm">Marco (tamaño de la card)</Label>
                <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
                  <div className="space-y-1 min-w-0">
                    <Label className="text-xs text-muted-foreground">Ancho</Label>
                    <Input
                      className="w-full min-w-0 text-base"
                      {...numberInputProps("frameW", formatDisplayNum(fromMm(editing.widthMm, frameUnit)), (v) => { updateEditing((t) => ({ ...t, widthMm: toMm(v, frameUnit) })); })}
                    />
                  </div>
                  <div className="space-y-1 min-w-0">
                    <Label className="text-xs text-muted-foreground">Alto</Label>
                    <Input
                      className="w-full min-w-0 text-base"
                      {...numberInputProps("frameH", formatDisplayNum(fromMm(editing.heightMm, frameUnit)), (v) => { updateEditing((t) => ({ ...t, heightMm: toMm(v, frameUnit) })); })}
                    />
                  </div>
                  <Select value={frameUnit} onValueChange={(v) => setFrameUnit(v as LengthUnit)}>
                    <SelectTrigger className="w-[4.5rem] shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(["mm", "cm", "in"] as const).map((u) => (
                        <SelectItem key={u} value={u}>
                          {UNIT_LABELS[u]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm">Espacio entre celdas</Label>
                <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
                  <Input
                    className="w-full min-w-0 text-base"
                    {...numberInputProps("gapMm", formatDisplayNum(fromMm(editing.gapMm ?? 2, frameUnit)), (v) => { updateEditing((t) => ({ ...t, gapMm: toMm(v, frameUnit) })); })}
                  />
                  <span className="text-sm text-muted-foreground pb-2">{frameUnit}</span>
                </div>
                <p className="text-xs text-muted-foreground">Distancia entre cards al imprimir en la hoja.</p>
              </div>

              {sheetLayout && (() => {
                const usableW = sheetLayout.pageWidthMm - sheetLayout.marginMm * 2;
                const usableH = sheetLayout.pageHeightMm - sheetLayout.marginMm * 2;
                const cardW = editing.widthMm;
                const cardH = editing.heightMm;
                const fits = cardW <= usableW && cardH <= usableH;
                const overflowW = Math.max(0, cardW - usableW);
                const overflowH = Math.max(0, cardH - usableH);
                if (fits) return null;
                return (
                  <div
                    role="alert"
                    className="flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
                  >
                    <AlertTriangle className="size-5 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium">La card no cabe en la hoja</p>
                      <p className="mt-1 text-destructive/90">
                        Área útil: {usableW.toFixed(0)} × {usableH.toFixed(0)} mm. Card: {cardW.toFixed(0)} × {cardH.toFixed(0)} mm.
                        {overflowW > 0 && (
                          <span className="block mt-0.5">
                            Sobra en ancho: {overflowW.toFixed(0)} mm (≈ {(overflowW / 25.4).toFixed(1)} pulg).
                          </span>
                        )}
                        {overflowH > 0 && (
                          <span className="block mt-0.5">
                            Sobra en alto: {overflowH.toFixed(0)} mm (≈ {(overflowH / 25.4).toFixed(1)} pulg).
                          </span>
                        )}
                        Reduce el tamaño del marco o el margen de la hoja para que quepa.
                      </p>
                    </div>
                  </div>
                );
              })()}
            </div>

            {ph && (
              <>
                <div className="space-y-3">
                  <Label className="text-sm">Placeholder (zona de la foto)</Label>
                  <p className="text-xs text-muted-foreground">Margen desde el borde del marco.</p>
                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground mb-2 block">Margen ({frameUnit})</Label>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1 min-w-0">
                          <Label className="text-xs text-muted-foreground">Top</Label>
                          <Input
                            className="w-full min-w-0 text-base"
                            {...numberInputProps("marginTop", formatDisplayNum(fromMm(ph.marginTopMm, frameUnit)), (v) => { setPlaceholder(0, { marginTopMm: toMm(v, frameUnit) }); })}
                          />
                        </div>
                        <div className="space-y-1 min-w-0">
                          <Label className="text-xs text-muted-foreground">Bottom</Label>
                          <Input
                            className="w-full min-w-0 text-base"
                            {...numberInputProps("marginBottom", formatDisplayNum(fromMm(ph.marginBottomMm, frameUnit)), (v) => { setPlaceholder(0, { marginBottomMm: toMm(v, frameUnit) }); })}
                          />
                        </div>
                        <div className="space-y-1 min-w-0">
                          <Label className="text-xs text-muted-foreground">Left</Label>
                          <Input
                            className="w-full min-w-0 text-base"
                            {...numberInputProps("marginLeft", formatDisplayNum(fromMm(ph.marginLeftMm, frameUnit)), (v) => { setPlaceholder(0, { marginLeftMm: toMm(v, frameUnit) }); })}
                          />
                        </div>
                        <div className="space-y-1 min-w-0">
                          <Label className="text-xs text-muted-foreground">Right</Label>
                          <Input
                            className="w-full min-w-0 text-base"
                            {...numberInputProps("marginRight", formatDisplayNum(fromMm(ph.marginRightMm, frameUnit)), (v) => { setPlaceholder(0, { marginRightMm: toMm(v, frameUnit) }); })}
                          />
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const half = (ph.marginLeftMm + ph.marginRightMm) / 2;
                            setPlaceholder(0, { marginLeftMm: half, marginRightMm: half });
                          }}
                        >
                          Centrar horizontal
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const half = (ph.marginTopMm + ph.marginBottomMm) / 2;
                            setPlaceholder(0, { marginTopMm: half, marginBottomMm: half });
                          }}
                        >
                          Centrar vertical
                        </Button>
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground mb-2 block">Tamaño del placeholder ({frameUnit})</Label>
                      <p className="text-xs text-muted-foreground mb-2">Ancho y alto del área de foto (se ajusta margin Right/Bottom).</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1 min-w-0">
                          <Label className="text-xs text-muted-foreground">Ancho</Label>
                          <Input
                            className="w-full min-w-0 text-base"
                            {...numberInputProps("placeholderW", formatDisplayNum(fromMm(cardW - ph.marginLeftMm - ph.marginRightMm, frameUnit)), (v) => {
                              const wMm = toMm(v, frameUnit);
                              setPlaceholder(0, { marginRightMm: Math.max(0, cardW - ph.marginLeftMm - wMm) });
                            })}
                          />
                        </div>
                        <div className="space-y-1 min-w-0">
                          <Label className="text-xs text-muted-foreground">Alto</Label>
                          <Input
                            className="w-full min-w-0 text-base"
                            {...numberInputProps("placeholderH", formatDisplayNum(fromMm(cardH - ph.marginTopMm - ph.marginBottomMm, frameUnit)), (v) => {
                              const hMm = toMm(v, frameUnit);
                              setPlaceholder(0, { marginBottomMm: Math.max(0, cardH - ph.marginTopMm - hMm) });
                            })}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <Label className="text-sm">Bordes (se ven en vista previa e impresión)</Label>
                      <div className="space-y-3 rounded border p-3 bg-muted/20">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id="outer-border"
                              checked={editing.outerBorder?.enabled ?? false}
                              onChange={(e) => {
                                updateEditing((t) => ({
                                  ...t,
                                  outerBorder: e.target.checked
                                    ? { enabled: true, style: "solid", widthMm: 0.1 }
                                    : { enabled: false, style: t.outerBorder?.style ?? "solid", widthMm: t.outerBorder?.widthMm ?? 0.1 },
                                }));
                              }}
                            />
                            <Label htmlFor="outer-border" className="text-sm font-medium">Borde externo (marco)</Label>
                          </div>
                          {(editing.outerBorder?.enabled ?? false) && (
                            <div className="grid grid-cols-2 gap-2 pl-6">
                              <div className="space-y-1 min-w-0">
                                <Label className="text-xs text-muted-foreground">Tipo</Label>
                                <Select
                                  value={editing.outerBorder?.style ?? "solid"}
                                  onValueChange={(v: TemplateBorderStyle) =>
                                    updateEditing((t) => ({
                                      ...t,
                                      outerBorder: t.outerBorder
                                        ? { ...t.outerBorder, style: v }
                                        : { enabled: true, style: v, widthMm: 0.1 },
                                    }))
                                  }
                                >
                                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="solid">Sólido</SelectItem>
                                    <SelectItem value="dashed">Discontinuo</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-1 min-w-0">
                                <Label className="text-xs text-muted-foreground">Grosor (mm)</Label>
                                <Input
                                  className="w-full min-w-0 text-base"
                                  {...numberInputProps("outerBorderW", formatDisplayNum(editing.outerBorder?.widthMm ?? 0.1), (v) => {
                                    if (!Number.isNaN(v) && v >= 0)
                                      updateEditing((t) => ({
                                        ...t,
                                        outerBorder: t.outerBorder
                                          ? { ...t.outerBorder, widthMm: v }
                                          : { enabled: true, style: "solid", widthMm: v },
                                      }));
                                  })}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id="inner-border"
                              checked={editing.innerBorder?.enabled ?? false}
                              onChange={(e) => {
                                updateEditing((t) => ({
                                  ...t,
                                  innerBorder: e.target.checked
                                    ? { enabled: true, style: "solid", widthMm: 0.1 }
                                    : { enabled: false, style: t.innerBorder?.style ?? "solid", widthMm: t.innerBorder?.widthMm ?? 0.1 },
                                }));
                              }}
                            />
                            <Label htmlFor="inner-border" className="text-sm font-medium">Borde interno (área de foto)</Label>
                          </div>
                          {(editing.innerBorder?.enabled ?? false) && (
                            <div className="grid grid-cols-2 gap-2 pl-6">
                              <div className="space-y-1 min-w-0">
                                <Label className="text-xs text-muted-foreground">Tipo</Label>
                                <Select
                                  value={editing.innerBorder?.style ?? "solid"}
                                  onValueChange={(v: TemplateBorderStyle) =>
                                    updateEditing((t) => ({
                                      ...t,
                                      innerBorder: t.innerBorder
                                        ? { ...t.innerBorder, style: v }
                                        : { enabled: true, style: v, widthMm: 0.1 },
                                    }))
                                  }
                                >
                                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="solid">Sólido</SelectItem>
                                    <SelectItem value="dashed">Discontinuo</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-1 min-w-0">
                                <Label className="text-xs text-muted-foreground">Grosor (mm)</Label>
                                <Input
                                  className="w-full min-w-0 text-base"
                                  {...numberInputProps("innerBorderW", formatDisplayNum(editing.innerBorder?.widthMm ?? 0.1), (v) => {
                                    if (!Number.isNaN(v) && v >= 0)
                                      updateEditing((t) => ({
                                        ...t,
                                        innerBorder: t.innerBorder
                                          ? { ...t.innerBorder, widthMm: v }
                                          : { enabled: true, style: "solid", widthMm: v },
                                      }));
                                  })}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
