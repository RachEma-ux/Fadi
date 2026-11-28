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

/** Octets décompressés ; `null` si le flux est illisible ou tronqué. */
export async function decompresser(octets: Uint8Array, format: FormatCompression = "deflate-raw"): Promise<Uint8Array | null> {
  try {
    return await passer(octets, new DecompressionStream(format));
  } catch {
    return null;
  }
}
