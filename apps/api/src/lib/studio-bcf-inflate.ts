/**
 * Décompresseur DEFLATE (méthode ZIP 8) borné pour l'import BCF côté serveur (IF-010, correctif de la revue PR #330).
 *
 * Le lecteur d'archive du modèle (`lireZip`, `studioLireBcf`) reste pur : il reçoit le décompresseur par injection. Ici,
 * `node:zlib` `inflateRawSync` avec `maxOutputLength` borne chaque entrée, et un compteur borne le total décompressé de
 * l'archive (bombe de décompression refusée, jamais de mémoire non bornée). Un dépassement lève une erreur nommée, que
 * l'appelant rend en 400 `bcf_illisible`.
 */
import { inflateRawSync } from "node:zlib";

/** Borne d'une entrée décompressée (octets). */
export const BCF_INFLATE_MAX_ENTREE = 32 * 1024 * 1024;
/** Borne du total décompressé d'une archive (octets). */
export const BCF_INFLATE_MAX_TOTAL = 64 * 1024 * 1024;

/** Décompresseur raw DEFLATE borné, à usage unique par archive (le total est compté sur toutes ses entrées). */
export function inflateBcfBorne(maxEntree = BCF_INFLATE_MAX_ENTREE, maxTotal = BCF_INFLATE_MAX_TOTAL): (brut: Uint8Array) => Promise<Uint8Array> {
  let total = 0;
  return async (brut) => {
    const borne = Math.min(maxEntree, maxTotal - total);
    if (borne <= 0) throw new Error(`archive BCF : contenu décompressé au-delà de ${maxTotal} octets`);
    let sortie: Buffer;
    try { sortie = inflateRawSync(brut, { maxOutputLength: borne }); }
    catch (e) {
      const code = (e as { code?: string }).code;
      if (code === "ERR_BUFFER_TOO_LARGE" || e instanceof RangeError) throw new Error(`archive BCF : entrée décompressée au-delà de la borne (${borne} octets)`);
      throw new Error("archive BCF : entrée DEFLATE illisible");
    }
    total += sortie.byteLength;
    return new Uint8Array(sortie.buffer, sortie.byteOffset, sortie.byteLength);
  };
}
