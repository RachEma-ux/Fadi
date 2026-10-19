/**
 * Tampons transférables (D.3-01) : un tampon transféré à un autre fil n'appartient plus à l'expéditeur (il est
 * « détaché », longueur 0). Ces fonctions affirment la propriété avant le transfert et interdisent tout usage après.
 *
 * - `preparerTransfert` : refuse un tampon partagé (non transférable), déjà transféré ou détaché, et retire les
 *   doublons (un tampon présent deux fois ferait échouer `postMessage`).
 * - `posterAvecTransfert` : prépare, poste, puis marque les tampons comme transférés ; si l'environnement ne les a pas
 *   détachés (portée simulée), ils restent quand même marqués : aucun code de l'expéditeur ne doit plus les lire.
 * - `assurerPossede` : à appeler avant de lire un tampon qui a pu être transféré.
 *
 * Pur : ni React, ni DOM.
 */

export class ErreurTransfert extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErreurTransfert";
  }
}

const transferes = new WeakSet<ArrayBuffer>();

const estDetache = (b: ArrayBuffer): boolean => (b as ArrayBuffer & { detached?: boolean }).detached === true;

export const estTransfere = (b: ArrayBuffer): boolean => transferes.has(b) || estDetache(b);

/** Lève une erreur si le tampon a été transféré : l'expéditeur n'en est plus propriétaire. */
export function assurerPossede(b: ArrayBuffer): void {
  if (estTransfere(b)) throw new ErreurTransfert("Tampon déjà transféré : il n'appartient plus à ce fil.");
}

export function preparerTransfert(objets: readonly unknown[]): ArrayBuffer[] {
  const vus = new Set<ArrayBuffer>();
  for (const o of objets) {
    if (typeof SharedArrayBuffer !== "undefined" && o instanceof SharedArrayBuffer) throw new ErreurTransfert("Tampon partagé : il ne se transfère pas.");
    if (!(o instanceof ArrayBuffer)) throw new ErreurTransfert("Seuls des ArrayBuffer sont transférés.");
    assurerPossede(o);
    vus.add(o);
  }
  return [...vus];
}

/** Poste `message` en transférant `tampons` (propriété affirmée avant, usage interdit après). */
export function posterAvecTransfert<M>(poster: (message: M, transfert: Transferable[]) => void, message: M, tampons: readonly unknown[]): void {
  const liste = preparerTransfert(tampons);
  poster(message, liste);
  for (const b of liste) transferes.add(b);
}
