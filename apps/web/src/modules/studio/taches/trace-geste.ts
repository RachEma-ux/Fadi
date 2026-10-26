/**
 * Trace horodatée d'un geste (EX-008, sens de dépendance) : l'interface invoque une capacité qui produit une
 * **intention** (outil du geste confirmé), traduite en **commande** (lot appliqué au brouillon par le modèle), puis
 * la **mutation canonique** (révision accusée par le serveur), enfin la **scène invalidée** (la vue 3D change de
 * révision source). Chaque étape est notée avec son horodatage (horloge monotone) et des identifiants non sensibles
 * seulement (outil, révision) ; jamais la géométrie. Lue dans la session (`globalThis.__fadiTraceGeste`). Pur.
 */
export type EtapeGeste = "intention" | "commande" | "mutation" | "scene";
export const ORDRE_GESTE: readonly EtapeGeste[] = Object.freeze(["intention", "commande", "mutation", "scene"] as const);
export interface EntreeGeste { readonly etape: EtapeGeste; readonly t: number; readonly outil?: string; readonly revision?: string }

export class TraceGeste {
  private readonly lignes: EntreeGeste[] = [];
  constructor(private readonly horloge: () => number = () => (typeof performance !== "undefined" ? performance.now() : Date.now()), private readonly taille = 200) {}
  noter(etape: EtapeGeste, d: { outil?: string; revision?: string } = {}): void {
    this.lignes.push({ etape, t: this.horloge(), ...(d.outil ? { outil: d.outil } : {}), ...(d.revision ? { revision: d.revision } : {}) });
    if (this.lignes.length > this.taille) this.lignes.splice(0, this.lignes.length - this.taille);
  }
  entrees(): readonly EntreeGeste[] { return [...this.lignes]; }
  vider(): void { this.lignes.length = 0; }
}

/**
 * Le dernier geste complet respecte-t-il l'ordre intention → commande → mutation → scène (horodatages croissants) ?
 * Rend les quatre entrées retenues (la dernière occurrence de chaque étape précédant la suivante), ou null.
 */
export function gesteOrdonne(entrees: readonly EntreeGeste[]): EntreeGeste[] | null {
  const scene = [...entrees].reverse().find((e) => e.etape === "scene");
  if (!scene) return null;
  const avant = (etape: EtapeGeste, limite: EntreeGeste) => [...entrees].reverse().find((e) => e.etape === etape && e.t <= limite.t && entrees.indexOf(e) < entrees.indexOf(limite));
  const mutation = avant("mutation", scene);
  if (!mutation || (scene.revision && mutation.revision && scene.revision !== mutation.revision)) return null;
  const commande = avant("commande", mutation);
  if (!commande) return null;
  const intention = avant("intention", commande);
  return intention ? [intention, commande, mutation, scene] : null;
}

/** Trace de la session (un onglet). */
export const traceGeste = new TraceGeste();
if (typeof globalThis !== "undefined") (globalThis as unknown as { __fadiTraceGeste?: TraceGeste }).__fadiTraceGeste = traceGeste;
