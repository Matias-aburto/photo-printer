import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Formato para inputs numéricos: entero cuando es whole number, sino hasta 2 decimales sin ceros finales. */
export function formatDisplayNum(n: number): string {
  if (Number.isInteger(n)) return String(n);
  const s = n.toFixed(2);
  return s.replace(/\.?0+$/, "");
}
