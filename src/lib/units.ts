/** Unidades soportadas para márgenes y tamaños */
export type LengthUnit = "mm" | "cm" | "in";

const MM_PER_CM = 10;
const MM_PER_IN = 25.4;

export function toMm(value: number, unit: LengthUnit): number {
  switch (unit) {
    case "mm":
      return value;
    case "cm":
      return value * MM_PER_CM;
    case "in":
      return value * MM_PER_IN;
    default:
      return value;
  }
}

export function fromMm(mm: number, unit: LengthUnit): number {
  switch (unit) {
    case "mm":
      return mm;
    case "cm":
      return mm / MM_PER_CM;
    case "in":
      return mm / MM_PER_IN;
    default:
      return mm;
  }
}

export const UNIT_LABELS: Record<LengthUnit, string> = {
  mm: "mm",
  cm: "cm",
  in: "pulg",
};
