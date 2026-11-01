import { validateStudioDocument } from "./composition/document.js";
import type { StudioDocument } from "./composition/types.js";

/**
 * Dérivation d'une variante en **copie indépendante** (TR-EX-013 / TR-INV-003, ADR-STUDIO-PILOTE-01 P-12). Deux modes
 * coexistent :
 *  - `version` (mode historique, par défaut) : la variante dérivée est une version du même ensemble d'objets ; elle garde
 *    leurs identifiants (comparaison entre variantes, provenance) ;
 *  - `copie` : chaque élément identifié du document reçoit une **nouvelle identité** ; la provenance (`identites` :
 *    nouvel identifiant → identifiant source) pointe vers les sources sans établir aucune propagation (EX-013) — une
 *    copie indépendante ne propage pas vers son origine (INV-003).
 *
 * Éléments renumérotés : objets 2D, cotes, solides (opérandes conservés des solides exacts compris), annotations,
 * architecture, scènes et apparences, éléments non natifs. Les calques gardent leur identifiant (organisation du
 * document, pas des objets). Les références internes sont reportées sur les nouvelles identités : `objectId` (cotes,
 * sources de prisme), `hostId` (ouvertures), `cibleId` (propriétés), cible `object` d'une apparence ; `layerId`,
 * `visibleLayers` et la cible `layer` d'une apparence restent inchangés. Fonction pure, déterministe pour un même
 * `suffixe` ; le document produit est validé.
 */
export const STUDIO_MODES_DERIVATION = Object.freeze(["version", "copie"] as const);
export type StudioModeDerivation = (typeof STUDIO_MODES_DERIVATION)[number];

/** Collections dont les éléments ont une identité propre (les calques n'en font pas partie). */
const COLLECTIONS = ["objects", "dimensions", "solides", "exacts", "cotesFaces", "annotations", "architecture", "scenes", "nonNatifs", "niveaux", "composants", "occurrences"] as const;
/** Champs qui désignent un élément identifié du document. */
const REFERENCES = new Set(["id", "objectId", "hostId", "cibleId", "solidId", "niveauId", "composantId"]);
const ID_MAX = 128;

export interface StudioCopieIndependante {
  document: StudioDocument;
  /** Provenance : nouvel identifiant → identifiant de l'élément source (aucune propagation). */
  identites: Record<string, string>;
}

/** Identifiants de tous les éléments identifiés (et opérandes conservés) d'un document, calques exclus. */
export function studioIdentitesDocument(doc: StudioDocument): string[] {
  const out = new Set<string>();
  // La cible d'une apparence (`target`) désigne un élément ou un calque : c'est une référence, pas une identité.
  const visiter = (v: unknown): void => {
    if (Array.isArray(v)) { for (const x of v) visiter(x); return; }
    if (!v || typeof v !== "object") return;
    const o = v as Record<string, unknown>;
    if (typeof o["id"] === "string") out.add(o["id"]);
    for (const [k, x] of Object.entries(o)) if (k !== "id" && k !== "target") visiter(x);
  };
  for (const c of COLLECTIONS) visiter((doc as unknown as Record<string, unknown>)[c]);
  return [...out];
}

function nouvelIdentifiant(source: string, suffixe: string, pris: Set<string>): string {
  const base = `${source}~${suffixe}`;
  let candidat = base.length <= ID_MAX ? base : `${source.slice(0, ID_MAX - suffixe.length - 10)}~${suffixe}`;
  for (let n = 2; pris.has(candidat); n += 1) candidat = `${candidat.slice(0, ID_MAX - String(n).length - 1)}-${n}`;
  pris.add(candidat);
  return candidat;
}

/** Copie indépendante d'un document : nouvel identifiant de document, nouvelles identités, références reportées. */
export function studioCopieIndependante(source: StudioDocument, documentId: string, suffixe: string): StudioCopieIndependante {
  if (!/^[A-Za-z0-9._-]{1,32}$/.test(suffixe)) throw new Error("studio-copie : suffixe d'identité invalide");
  const anciens = studioIdentitesDocument(source);
  const pris = new Set<string>([...anciens, ...(source.layers ?? []).map((l) => l.id)]);
  const vers = new Map<string, string>();
  for (const id of anciens) if (!vers.has(id)) vers.set(id, nouvelIdentifiant(id, suffixe, pris));
  const reporter = (v: unknown, cibleCalque: boolean): unknown => {
    if (Array.isArray(v)) return v.map((x) => reporter(x, false));
    if (!v || typeof v !== "object") return v;
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (REFERENCES.has(k) && typeof x === "string" && !(k === "id" && cibleCalque)) out[k] = vers.get(x) ?? x;
      else out[k] = reporter(x, k === "target" && !!x && typeof x === "object" && (x as Record<string, unknown>)["kind"] === "layer");
    }
    return out;
  };
  const copie: Record<string, unknown> = { ...structuredClone(source), id: documentId };
  for (const c of COLLECTIONS) if (c in copie) copie[c] = reporter(copie[c], false);
  // Propriétés : rangées par cible (`cibleId`), sans identité propre.
  if ("proprietes" in copie) copie["proprietes"] = reporter(copie["proprietes"], false);
  const document = validateStudioDocument(copie);
  return { document, identites: Object.fromEntries([...vers].map(([ancien, nouveau]) => [nouveau, ancien])) };
}

/**
 * Contrôle d'une copie indépendante (INV-003 [−]) : identifiants de la copie qui réutilisent une identité de la source
 * (un ancien identifiant porté par le nouveau propriétaire). Vide : aucune identité partagée.
 */
export function studioIdentitesReutilisees(source: StudioDocument, copie: StudioDocument): string[] {
  const anciens = new Set(studioIdentitesDocument(source));
  return [...new Set(studioIdentitesDocument(copie).filter((id) => anciens.has(id)))];
}
