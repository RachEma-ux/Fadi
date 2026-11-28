/**
 * Compression et décompression par les flux intégrés aux navigateurs (CompressionStream / DecompressionStream, aussi
 * présents dans Node), sans bibliothèque. Décision du maître d'ouvrage du 28 novembre 2026 (« 3 A ») : ils remplacent
 * l'ancien décompresseur écrit pour Fadi (`inflate.ts`). « deflate-raw » sert aux archives ZIP (méthode 8),
 * « deflate » (enveloppe zlib) aux flux FlateDecode des PDF. Pur : ni DOM, ni React.
 */
export type FormatCompression = "deflate-raw" | "deflate";

async function passer(octets: Uint8Array, flux: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const source = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(octets);
      c.close();
    },
  });
  return new Uint8Array(await new Response(source.pipeThrough(flux as unknown as TransformStream<Uint8Array, Uint8Array>)).arrayBuffer());
}

/** Octets compressés (« deflate-raw » par défaut). */
export const compresser = (octets: Uint8Array, format: FormatCompression = "deflate-raw"): Promise<Uint8Array> => passer(octets, new CompressionStream(format));

/** Taille décompressée maximale par défaut (512 Mio) : une archive ou un flux piégé est refusé avant d'occuper la mémoire. */
export const DECOMPRESSION_MAX = 512 * 1024 * 1024;

/**
 * Octets décompressés ; `null` si le flux est illisible, tronqué ou s'il dépasse `max` octets (lecture arrêtée dès le
 * dépassement, jamais de résultat partiel).
 */
export async function decompresser(octets: Uint8Array, format: FormatCompression = "deflate-raw", max = DECOMPRESSION_MAX): Promise<Uint8Array | null> {
  const source = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(octets);
      c.close();
    },
  });
  const lecteur = source.pipeThrough(new DecompressionStream(format) as unknown as TransformStream<Uint8Array, Uint8Array>).getReader();
  const morceaux: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await lecteur.read();
      if (done) break;
      total += value.length;
      if (total > max) {
        await lecteur.cancel().catch(() => undefined);
        return null;
      }
      morceaux.push(value);
    }
  } catch {
    return null;
  }
  const sortie = new Uint8Array(total);
  let k = 0;
  for (const m of morceaux) {
    sortie.set(m, k);
    k += m.length;
  }
  return sortie;
}
