/**
 * Portées étroites des rôles métier (Issue #262, reliquat de la phase 2 ; concept `users-management`, partie 2
 * « Action and scope assignments » et « Effective access rules »). Règles pures : aucune base, aucun réseau, aucun DOM.
 * Partagées par le serveur (gardes des routes Studio et Documents, `apps/api/src/lib/owned-project.ts`) et par
 * l'interface (onglet Participants : capacité résultante d'une attribution).
 *
 * Règle directrice : une portée étroite (`etude`, `variante`, `revision`, `documents`) **n'ouvre jamais l'accès au
 * projet**. Elle n'est lue que pour un participant qui lit déjà le projet par un rôle de portée `projet` (vue
 * `project_effective_access`), et elle **ajoute** une capacité précise, à l'intérieur de son périmètre seulement.
 *
 * Périmètres (`couvre`) :
 *  - `etude:X`     → tout ce qui appartient à l'étude X (variantes, révisions, publications, feuilles, dossiers) ;
 *  - `variante:V`  → ce qui ne porte QUE sur la variante V (une publication coordonnée avec une autre variante, un
 *                    dossier d'étude, une nouvelle variante ne sont pas couverts) ;
 *  - `revision:R`  → ce qui porte sur la seule révision R (publication de R sans variante coordonnée ; observation
 *                    ancrée sur R) ;
 *  - `documents:D` → D = une famille du catalogue Documents (`tableaux`, `atelier`, `dessins`, `studio`,
 *                    `studio-dossier`, `harmonie`, `bilan`, `exemple`) ou un document identifié par son `kind`
 *                    (`tableau-surfaces`, `dessin:<id>`, `studio:<publication>`, `studio-dossier:<dossier>`…).
 */

export type RoleMetier = "lecteur" | "concepteur" | "relecteur" | "coordinateur" | "approbateur" | "diffuseur";
export type TypePortee = "projet" | "etude" | "variante" | "revision" | "documents";
export type TypePorteeEtroite = Exclude<TypePortee, "projet">;

/**
 * Capacités qu'une portée étroite peut ajouter :
 *  - `modifier`    : écrire le contenu Studio (commandes, métré, feuilles, préparation et soumission des publications) ;
 *  - `constater`   : recontrôler et rouvrir les observations Studio du périmètre (un lecteur du projet ouvre déjà des
 *                    observations : il commente) ;
 *  - `approuver`   : approuver ou refuser une publication Studio du périmètre ;
 *  - `diffuser`    : diffuser ou retirer une publication Studio du périmètre ;
 *  - `telecharger` : produire, exporter et télécharger les documents du périmètre.
 */
export type CapacitePortee = "modifier" | "constater" | "approuver" | "diffuser" | "telecharger";

export const TYPES_PORTEE_ETROITE: readonly TypePorteeEtroite[] = Object.freeze(["etude", "variante", "revision", "documents"]);

const AUCUNE: readonly CapacitePortee[] = Object.freeze([]);
const DOCS: readonly CapacitePortee[] = Object.freeze(["telecharger"]);

/**
 * Matrice rôle × portée étroite → capacités ajoutées (choix déclarés dans `portees-etroites.md`) :
 *  - Lecteur : rien de plus qu'à la portée projet, sauf le téléchargement explicite des documents désignés ;
 *  - Concepteur : modifier dans l'étude ou la variante (une révision est immuable : rien) ;
 *  - Relecteur : constater dans l'étude, la variante ou la révision ;
 *  - Coordinateur : rien à portée étroite (les responsabilités de coordination restent de portée projet) ;
 *  - Approbateur / Diffuseur : approuver / diffuser les publications Studio du périmètre ;
 *  - tout rôle à la portée `documents` : télécharger ces documents (le droit de télécharger est explicite).
 */
export const CAPACITES_PORTEE: Readonly<Record<RoleMetier, Readonly<Record<TypePorteeEtroite, readonly CapacitePortee[]>>>> = Object.freeze({
  lecteur: { etude: AUCUNE, variante: AUCUNE, revision: AUCUNE, documents: DOCS },
  concepteur: { etude: Object.freeze(["modifier"] as CapacitePortee[]), variante: Object.freeze(["modifier"] as CapacitePortee[]), revision: AUCUNE, documents: DOCS },
  relecteur: { etude: Object.freeze(["constater"] as CapacitePortee[]), variante: Object.freeze(["constater"] as CapacitePortee[]), revision: Object.freeze(["constater"] as CapacitePortee[]), documents: DOCS },
  coordinateur: { etude: AUCUNE, variante: AUCUNE, revision: AUCUNE, documents: DOCS },
  approbateur: { etude: Object.freeze(["approuver"] as CapacitePortee[]), variante: Object.freeze(["approuver"] as CapacitePortee[]), revision: Object.freeze(["approuver"] as CapacitePortee[]), documents: DOCS },
  diffuseur: { etude: Object.freeze(["diffuser"] as CapacitePortee[]), variante: Object.freeze(["diffuser"] as CapacitePortee[]), revision: Object.freeze(["diffuser"] as CapacitePortee[]), documents: DOCS },
});

/** Capacités ajoutées par un rôle à une portée ; la portée projet relève de `deriveAccess` (rien ici). */
export function capacitesDePortee(role: RoleMetier, scopeType: TypePortee): readonly CapacitePortee[] {
  if (scopeType === "projet") return AUCUNE;
  return CAPACITES_PORTEE[role]?.[scopeType] ?? AUCUNE;
}

/** Besoin d'une route (vocabulaire de `owned-project.ts`) → capacité de portée qui peut le satisfaire. */
export const CAPACITE_DU_BESOIN: Readonly<Record<string, CapacitePortee>> = Object.freeze({
  write: "modifier",
  modify: "modifier",
  approve: "approuver",
  publish: "diffuser",
  export: "telecharger",
});

export interface AttributionPortee { role: RoleMetier; scopeType: TypePortee; scopeId: string | null }

/**
 * Ressource visée par une requête, relue en base par le serveur AVANT l'appel (jamais lue du corps de la requête) :
 * étude, variantes du contenu (toutes : une publication coordonnée en porte plusieurs), révision, document.
 */
export interface CiblePortee {
  studyId?: string | null;
  variantIds?: readonly string[];
  revisionId?: string | null;
  document?: { famille: string; kind: string } | null;
}

/** L'attribution couvre-t-elle la cible ? Comparaison exacte des identifiants ; une cible vide n'est jamais couverte. */
export function couvre(a: AttributionPortee, cible: CiblePortee): boolean {
  const id = a.scopeId;
  if (!id) return false;
  const variants = [...new Set(cible.variantIds ?? [])];
  switch (a.scopeType) {
    case "etude": return !!cible.studyId && cible.studyId === id;
    case "variante": return variants.length > 0 && variants.every((v) => v === id);
    case "revision": return !!cible.revisionId && cible.revisionId === id && variants.length <= 1;
    case "documents": return !!cible.document && (cible.document.famille === id || cible.document.kind === id);
    default: return false;
  }
}

/**
 * L'attribution étroite qui donne `capacite` sur `cible`, ou null. Les attributions de portée projet sont ignorées
 * (elles relèvent de `deriveAccess`) ; l'appelant ne consulte cette fonction que pour un participant qui lit déjà le
 * projet. La réponse nomme l'attribution qui autorise (« par quelle affectation », concept partie 2).
 */
export function capaciteDansPortee(attributions: readonly AttributionPortee[], capacite: CapacitePortee, cible: CiblePortee): AttributionPortee | null {
  for (const a of attributions) {
    if (a.scopeType === "projet") continue;
    if (!capacitesDePortee(a.role, a.scopeType).includes(capacite)) continue;
    if (couvre(a, cible)) return a;
  }
  return null;
}

/** Familles du catalogue Documents qu'une portée `documents` peut désigner (l'archive du projet entier en est exclue). */
export const FAMILLES_DOCUMENTS: readonly string[] = Object.freeze(["tableaux", "atelier", "dessins", "studio", "studio-dossier", "harmonie", "bilan", "exemple"]);

/** Famille d'un document du catalogue d'après son `kind` (même règle que le catalogue `lib/documents.ts`). */
export function familleDocument(kind: string): string | null {
  if (kind === "archive-projet") return null;
  if (kind.startsWith("dessin:")) return "dessins";
  if (kind.startsWith("studio-dossier:")) return "studio-dossier";
  if (kind.startsWith("studio:")) return "studio";
  if (kind.startsWith("atelier-")) return "atelier";
  if (kind.startsWith("harmonie-")) return "harmonie";
  if (kind === "bilan-batiment" || kind.startsWith("plan-lecture-")) return "bilan";
  if (kind === "dossier-exemple") return "exemple";
  if (kind === "tableau-surfaces" || kind === "programme-csv" || kind === "fiches-espaces-csv") return "tableaux";
  return null;
}

/** Cible d'un document du catalogue ; null pour un document qu'aucune portée ne peut désigner (archive du projet). */
export function cibleDocument(kind: string): CiblePortee | null {
  const famille = familleDocument(kind);
  return famille ? { document: { famille, kind } } : null;
}

const IDENTIFIANT = /^[A-Za-z0-9_.:\-]{1,120}$/;

/**
 * Forme d'un identifiant de portée étroite (null : admis). Le serveur vérifie en plus que l'étude, la variante, la
 * révision ou le document existe dans CE projet.
 */
export function problemeIdentifiantPortee(scopeType: TypePortee, scopeId: string | null | undefined): string | null {
  if (scopeType === "projet") return scopeId ? "Une portée projet ne prend aucun identifiant." : null;
  const id = (scopeId ?? "").trim();
  if (!id) return "Choisissez l'élément de la portée.";
  if (!IDENTIFIANT.test(id)) return "Identifiant de portée invalide.";
  if (scopeType === "documents" && !FAMILLES_DOCUMENTS.includes(id) && familleDocument(id) === null) {
    return "Portée documents : une famille du catalogue ou un document identifié (l'archive du projet entier n'est pas désignable).";
  }
  return null;
}
