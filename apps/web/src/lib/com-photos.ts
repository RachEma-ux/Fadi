/**
 * Photos de la Communication (lot COM-13, COM-D15) — compression sur l'appareil avant tout envoi : JPEG, 2 560 px au
 * plus par côté, 2 Mo au plus ; le réencodage retire aussi les métadonnées (EXIF, position) — le serveur les retire de
 * toute façon. La partie pure (`dimensionsCibles`, `QUALITES`) est testée par `com-photos.test.ts` ; la partie navigateur
 * (`compresserPhoto`) emploie `createImageBitmap` et un canevas.
 */
export const COTE_MAX = 2560;
export const OCTETS_MAX = 2 * 1024 * 1024;
/** Qualités JPEG essayées dans l'ordre jusqu'à tenir dans 2 Mo. */
export const QUALITES = [0.85, 0.75, 0.65, 0.55, 0.45] as const;

/** Dimensions réduites (proportions gardées) pour que le plus grand côté tienne dans `max`. */
export function dimensionsCibles(width: number, height: number, max = COTE_MAX): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) throw new Error("dimensions invalides");
  const k = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}

export interface PhotoCompressee { blob: Blob; width: number; height: number }

/** Compresse une image choisie ou prise par l'appareil ; refuse ce qui ne tient pas dans 2 Mo à la plus basse qualité. */
export async function compresserPhoto(fichier: Blob): Promise<PhotoCompressee> {
  // L'orientation de l'appareil est appliquée aux pixels (puis l'EXIF disparaît au réencodage).
  const image = await createImageBitmap(fichier, { imageOrientation: "from-image" });
  try {
    let { width, height } = dimensionsCibles(image.width, image.height);
    for (let essai = 0; essai < 3; essai++) {
      const canevas = document.createElement("canvas");
      canevas.width = width;
      canevas.height = height;
      const ctx = canevas.getContext("2d");
      if (!ctx) throw new Error("canevas indisponible");
      ctx.drawImage(image, 0, 0, width, height);
      for (const q of QUALITES) {
        const blob = await new Promise<Blob | null>((ok) => canevas.toBlob(ok, "image/jpeg", q));
        if (blob && blob.size <= OCTETS_MAX) return { blob, width, height };
      }
      // Toujours trop lourd : on réduit encore les dimensions.
      ({ width, height } = dimensionsCibles(width, height, Math.round(Math.max(width, height) * 0.75)));
    }
    throw new Error("La photo ne tient pas dans 2 Mo.");
  } finally {
    image.close();
  }
}
