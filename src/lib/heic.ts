const HEIC_TYPES = ["image/heic", "image/heif", "image/heic-sequence"];
const HEIC_EXT = /\.(heic|heif)$/i;

export function isHeic(file: File): boolean {
  if (HEIC_TYPES.includes(file.type)) return true;
  return HEIC_EXT.test(file.name);
}

/**
 * Returns a blob and filename suitable for display/export.
 * Converts HEIC/HEIF to JPEG in the browser; other image files are passed through.
 */
export async function fileToDisplayBlob(
  file: File
): Promise<{ blob: Blob; fileName: string }> {
  if (typeof window === "undefined" || !isHeic(file)) {
    return { blob: file, fileName: file.name };
  }
  const heic2any = (await import("heic2any")).default as (opts: {
    blob: Blob;
    toType?: string;
  }) => Promise<Blob | Blob[]>;
  const result = await heic2any({ blob: file, toType: "image/jpeg" });
  const blob = Array.isArray(result) ? result[0] : result;
  const fileName = file.name.replace(HEIC_EXT, ".jpg");
  return { blob, fileName };
}
