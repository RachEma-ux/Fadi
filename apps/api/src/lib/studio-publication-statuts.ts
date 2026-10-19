/**
 * Publications Studio — règles pures du lot E.4 (E.4-01 à E.4-06) : aucune base, aucun réseau, aucun DOM.
 *
 * Trois dimensions distinctes (E.4-01), chacune avec son vocabulaire :
 *   - travail : `brouillon` → `en-revue` → `approuve` | `refuse` ;
 *   - diffusion : `non-diffuse` → `diffuse` → `retire` | `remplace` (un paquet remplacé reste retirable) ;
 *   - actualité des contenus dérivés : `a-jour` | `perimee`, calculée (jamais stockée) en comparant le manifeste figé
 *     aux sources courantes (tête de chaque variante source, métadonnées gelées dans les exports).
 * Le statut combiné historique (`travail` | `soumis` | `approuve` | `refuse` | `diffuse` | `retire`) reste tenu en
 * parallèle pour les lecteurs existants (module Documents, refus de suppression d'un projet) : `statutCombine`.
 *
 * Droits (E.4-02) — correspondance prudente avec les rôles de projet existants (`owned-project.ts`) :
 *   - lecture (dossier, manifeste, journal, fichiers, vérification) : besoin `read` → propriétaire, éditeur, lecteur ;
 *   - revue (préparer, soumettre, actualiser le manifeste) : besoin `write` → propriétaire, éditeur ;
 *   - approbation (approuver, refuser) : besoin `owner` → propriétaire seul ;
 *   - publication (diffuser, retirer ; le remplacement suit la diffusion d'un paquet plus récent) : `owner` → propriétaire seul.
 * Un lecteur ne fait que lire. Les refus suivent le style existant (`projectAccessRefusal` : 404 / 403 / 423).
 *
 * Manifeste figé multi-sources (E.4-03) : sources coordonnées (variante principale et variantes coordonnées, chacune
 * avec sa révision et l'empreinte SHA-256 de son document), métadonnées gelées des exports, empreintes des documents du
 * paquet ; son empreinte est le SHA-256 de son JSON canonique (clés triées).
 * Approbation (E.4-04) : elle porte l'empreinte exacte du manifeste examiné. Diffusion (E.4-05) : refusée (409
 * `manifest_mismatch`) dès que le manifeste courant diffère du manifeste approuvé ; une nouvelle approbation est requise
 * (actualiser, soumettre, approuver). Retrait et remplacement (E.4-06) : journalisés (auteur, date, motif), rien n'est
 * supprimé.
 */
import { createHash } from "node:crypto";
import type { ProjectNeed } from "./owned-project.js";

export type StatutTravail = "brouillon" | "en-revue" | "approuve" | "refuse";
export type StatutDiffusion = "non-diffuse" | "diffuse" | "retire" | "remplace";
export type Actualite = "a-jour" | "perimee";
/** Statut combiné historique (colonne `status`), conservé pour les lecteurs existants. */
export type StatutCombine = "travail" | "soumis" | "approuve" | "refuse" | "diffuse" | "retire";

export const STUDIO_PUBLICATION_ACTIONS = ["soumettre", "approuver", "refuser", "diffuser", "retirer", "actualiser"] as const;
export type StudioPublicationTransition = (typeof STUDIO_PUBLICATION_ACTIONS)[number];
export const STATUTS_TRAVAIL: readonly StatutTravail[] = ["brouillon", "en-revue", "approuve", "refuse"];
export const STATUTS_DIFFUSION: readonly StatutDiffusion[] = ["non-diffuse", "diffuse", "retire", "remplace"];

/** Capacités distinctes (E.4-02) et besoin de droit de projet de chacune. */
export type CapacitePublication = "lecture" | "revue" | "approbation" | "publication";
export const BESOIN_CAPACITE: Readonly<Record<CapacitePublication, ProjectNeed>> = Object.freeze({
  lecture: "read", revue: "write", approbation: "owner", publication: "owner",
});
/** Rôles de projet admis par capacité (documentation et indications d'interface ; le serveur revérifie). */
export const ROLES_CAPACITE: Readonly<Record<CapacitePublication, readonly ("proprietaire" | "editeur" | "lecteur")[]>> = Object.freeze({
  lecture: ["proprietaire", "editeur", "lecteur"], revue: ["proprietaire", "editeur"], approbation: ["proprietaire"], publication: ["proprietaire"],
});

interface RegleTransition {
  capacite: Exclude<CapacitePublication, "lecture">;
  travail: readonly StatutTravail[];
  diffusion: readonly StatutDiffusion[];
  commentaire: "facultatif" | "requis";
  /** Manifeste requis et à jour avant la transition (soumettre, approuver). */
  manifesteAJour: boolean;
}
export const REGLES_TRANSITION: Readonly<Record<StudioPublicationTransition, RegleTransition>> = Object.freeze({
  soumettre: { capacite: "revue", travail: ["brouillon"], diffusion: ["non-diffuse"], commentaire: "facultatif", manifesteAJour: true },
  actualiser: { capacite: "revue", travail: ["brouillon", "en-revue", "approuve", "refuse"], diffusion: ["non-diffuse"], commentaire: "facultatif", manifesteAJour: false },
  approuver: { capacite: "approbation", travail: ["en-revue"], diffusion: ["non-diffuse"], commentaire: "facultatif", manifesteAJour: true },
  refuser: { capacite: "approbation", travail: ["en-revue"], diffusion: ["non-diffuse"], commentaire: "requis", manifesteAJour: false },
  diffuser: { capacite: "publication", travail: ["approuve"], diffusion: ["non-diffuse"], commentaire: "facultatif", manifesteAJour: false },
  retirer: { capacite: "publication", travail: ["brouillon", "en-revue", "approuve", "refuse"], diffusion: ["non-diffuse", "diffuse", "remplace"], commentaire: "requis", manifesteAJour: false },
});
export const besoinTransition = (action: StudioPublicationTransition): ProjectNeed => BESOIN_CAPACITE[REGLES_TRANSITION[action].capacite];

export interface Dimensions { travail: StatutTravail; diffusion: StatutDiffusion }
export interface EtatPublication extends Dimensions {
  /** Le dossier porte un manifeste figé (faux pour une publication antérieure au lot E.4, à actualiser). */
  manifeste: boolean;
  actualite: Actualite;
}

export type Refus = { status: number; body: Record<string, unknown> };
export type Verdict = { ok: true; vers: Dimensions } | { ok: false; refus: Refus };

/** Contrôle pur d'une transition : statuts de départ, manifeste, commentaire. Les droits sont vérifiés à part. */
export function controlerTransition(action: StudioPublicationTransition, etat: EtatPublication, commentaire?: string): Verdict {
  const regle = REGLES_TRANSITION[action];
  if (!regle.travail.includes(etat.travail) || !regle.diffusion.includes(etat.diffusion)) {
    return { ok: false, refus: { status: 409, body: {
      error: "invalid_transition", action, status: statutCombine(etat), workStatus: etat.travail, diffusionStatus: etat.diffusion,
      message: `Transition « ${action} » impossible depuis le statut « ${statutCombine(etat)} ».`,
    } } };
  }
  if (regle.manifesteAJour && !etat.manifeste) {
    return { ok: false, refus: { status: 409, body: { error: "manifest_missing", action, message: "Ce dossier n'a pas de manifeste figé : actualisez-le avant de le soumettre ou de l'approuver." } } };
  }
  if (regle.manifesteAJour && etat.actualite === "perimee") {
    return { ok: false, refus: { status: 409, body: { error: "manifest_outdated", action, message: "Une source a changé depuis le manifeste : actualisez le dossier, puis soumettez-le à nouveau." } } };
  }
  if (action === "actualiser" && etat.manifeste && etat.actualite === "a-jour") {
    return { ok: false, refus: { status: 409, body: { error: "manifest_current", action, message: "Le manifeste est déjà à jour : rien à actualiser." } } };
  }
  if (regle.commentaire === "requis" && !commentaire?.trim()) {
    return { ok: false, refus: { status: 400, body: { error: "invalid_input", code: "comment_required", message: "Un commentaire est requis pour cette transition." } } };
  }
  return { ok: true, vers: dimensionsApres(action, etat) };
}

function dimensionsApres(action: StudioPublicationTransition, d: Dimensions): Dimensions {
  switch (action) {
    case "soumettre": return { travail: "en-revue", diffusion: d.diffusion };
    case "actualiser": return { travail: "brouillon", diffusion: d.diffusion };
    case "approuver": return { travail: "approuve", diffusion: d.diffusion };
    case "refuser": return { travail: "refuse", diffusion: d.diffusion };
    case "diffuser": return { travail: d.travail, diffusion: "diffuse" };
    case "retirer": return { travail: d.travail, diffusion: "retire" };
  }
}

/** Un paquet diffusé est remplacé par la diffusion plus récente d'un dossier de la même variante principale. */
export const remplacable = (d: Dimensions): boolean => d.diffusion === "diffuse";

/** Statut combiné historique d'après les deux dimensions stockées. */
export function statutCombine(d: Dimensions): StatutCombine {
  if (d.diffusion === "retire") return "retire";
  if (d.diffusion === "diffuse" || d.diffusion === "remplace") return "diffuse";
  return ({ brouillon: "travail", "en-revue": "soumis", approuve: "approuve", refuse: "refuse" } as const)[d.travail];
}

/**
 * Dimensions d'une ligne : colonnes du lot E.4 si présentes, sinon déduites du statut combiné (ligne antérieure).
 * Une ligne antérieure retirée garde le travail `approuve` si elle portait une approbation, `brouillon` sinon.
 */
export function dimensionsDe(row: { status: StatutCombine; workStatus: StatutTravail | null; diffusionStatus: StatutDiffusion | null; approvedRevisionId: string | null; replacedAt?: Date | null }): Dimensions {
  const travail: StatutTravail = row.workStatus ?? (() => {
    switch (row.status) {
      case "travail": return "brouillon";
      case "soumis": return "en-revue";
      case "refuse": return "refuse";
      case "approuve": case "diffuse": return "approuve";
      case "retire": return row.approvedRevisionId ? "approuve" : "brouillon";
    }
  })();
  const diffusion: StatutDiffusion = row.diffusionStatus
    ?? (row.status === "retire" ? "retire" : row.status === "diffuse" ? (row.replacedAt ? "remplace" : "diffuse") : "non-diffuse");
  return { travail, diffusion };
}

// --- Empreintes et manifeste ----------------------------------------------------------------------------------------

/** JSON canonique (clés triées, ordre des tableaux conservé, `undefined` omis) : jsonb ne garde pas l'ordre des clés. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
export const sha256 = (data: string | Uint8Array): string => createHash("sha256").update(data).digest("hex");

export type RoleSource = "principale" | "coordonnee";
export interface ManifesteSource { role: RoleSource; variantId: string; revisionId: string; documentHash: string }
export interface ManifesteMeta { projectCode: string; projectName: string; studyName: string; variantName: string; revisionCreatedAt: string }
export interface ManifesteDocument { format: string; fileName: string; mime: string; size: number; sha256: string }
export interface ManifestePublication {
  schema: "studio-publication-manifest/1";
  sources: ManifesteSource[];
  meta: ManifesteMeta;
  documents: ManifesteDocument[];
}

/** Manifeste normalisé : une seule source principale en tête, coordonnées triées et sans doublon, documents triés par format. */
export function construireManifeste(sources: readonly ManifesteSource[], meta: ManifesteMeta, documents: readonly ManifesteDocument[]): ManifestePublication {
  const principales = sources.filter((s) => s.role === "principale");
  if (principales.length !== 1) throw new Error("studio_manifest_principal_source");
  const vus = new Set<string>([principales[0]!.variantId]);
  const coordonnees = sources.filter((s) => s.role === "coordonnee").filter((s) => (vus.has(s.variantId) ? false : (vus.add(s.variantId), true)))
    .sort((a, b) => (a.variantId < b.variantId ? -1 : a.variantId > b.variantId ? 1 : 0));
  const formats = new Set<string>();
  for (const d of documents) { if (formats.has(d.format)) throw new Error("studio_manifest_duplicate_document"); formats.add(d.format); }
  return {
    schema: "studio-publication-manifest/1",
    sources: [principales[0]!, ...coordonnees].map((s) => ({ role: s.role, variantId: s.variantId, revisionId: s.revisionId, documentHash: s.documentHash })),
    meta: { projectCode: meta.projectCode, projectName: meta.projectName, studyName: meta.studyName, variantName: meta.variantName, revisionCreatedAt: meta.revisionCreatedAt },
    documents: [...documents].sort((a, b) => (a.format < b.format ? -1 : a.format > b.format ? 1 : 0))
      .map((d) => ({ format: d.format, fileName: d.fileName, mime: d.mime, size: d.size, sha256: d.sha256 })),
  };
}
export const empreinteManifeste = (m: ManifestePublication): string => sha256(canonicalJson(m));

/** État courant d'une source : tête de la variante (null si la variante n'existe plus). */
export interface SourceCourante { variantId: string; headRevisionId: string | null }
export type EcartManifeste =
  | { type: "source"; role: RoleSource; variantId: string; revisionFigee: string; revisionCourante: string | null }
  | { type: "meta"; champ: keyof ManifesteMeta; figee: string; courante: string };

/**
 * Écarts entre le manifeste figé et les sources courantes. Les révisions sont immuables : une tête inchangée garde son
 * document et son empreinte ; les métadonnées gelées entrent dans les exports, donc un renommage périme aussi le dossier.
 */
export function ecartsManifeste(m: ManifestePublication, courantes: readonly SourceCourante[], meta: Omit<ManifesteMeta, "revisionCreatedAt">): EcartManifeste[] {
  const tetes = new Map(courantes.map((c) => [c.variantId, c.headRevisionId]));
  const ecarts: EcartManifeste[] = [];
  for (const s of m.sources) {
    const tete = tetes.has(s.variantId) ? tetes.get(s.variantId)! : null;
    if (tete !== s.revisionId) ecarts.push({ type: "source", role: s.role, variantId: s.variantId, revisionFigee: s.revisionId, revisionCourante: tete });
  }
  for (const champ of ["projectCode", "projectName", "studyName", "variantName"] as const) {
    if (m.meta[champ] !== meta[champ]) ecarts.push({ type: "meta", champ, figee: m.meta[champ], courante: meta[champ] });
  }
  return ecarts;
}
export const actualiteDe = (ecarts: readonly EcartManifeste[]): Actualite => (ecarts.length ? "perimee" : "a-jour");

/**
 * Concordance de l'approbation (E.4-05) : la diffusion n'est admise que si le manifeste courant a exactement
 * l'empreinte du manifeste approuvé, elle-même celle du manifeste figé du dossier.
 */
export function controlerApprobation(approuvee: string | null, figee: string | null, courante: string): Refus | null {
  if (!approuvee || !figee) {
    return { status: 409, body: { error: "manifest_missing", message: "Aucun manifeste approuvé pour ce dossier : actualisez-le, soumettez-le et faites-le approuver." } };
  }
  if (approuvee !== figee || approuvee !== courante) {
    return { status: 409, body: {
      error: "manifest_mismatch", approvedManifestHash: approuvee, frozenManifestHash: figee, currentManifestHash: courante,
      message: "Le manifeste courant diffère du manifeste approuvé : une nouvelle approbation est requise (actualiser, soumettre, approuver).",
    } };
  }
  return null;
}

/** Ensemble examiné lors d'une approbation (E.4-04) : l'empreinte du manifeste, et révision / empreinte si fournies. */
export function controlerEnsembleExamine(
  examine: { manifestHash?: string | undefined; revisionId?: string | undefined; documentHash?: string | undefined },
  dossier: { manifestHash: string; revisionId: string; documentHash: string },
): Refus | null {
  if (!examine.manifestHash) {
    return { status: 400, body: { error: "invalid_input", code: "examined_set_required", message: "L'approbation porte sur le manifeste examiné : manifestHash est requis." } };
  }
  const autre = examine.manifestHash !== dossier.manifestHash
    || (examine.revisionId !== undefined && examine.revisionId !== dossier.revisionId)
    || (examine.documentHash !== undefined && examine.documentHash !== dossier.documentHash);
  if (!autre) return null;
  return { status: 409, body: {
    error: "revision_mismatch", publicationManifestHash: dossier.manifestHash, publicationRevisionId: dossier.revisionId, publicationDocumentHash: dossier.documentHash,
    examinedManifestHash: examine.manifestHash, examinedRevisionId: examine.revisionId ?? null, examinedDocumentHash: examine.documentHash ?? null,
    message: "L'ensemble examiné n'est pas celui de la publication.",
  } };
}
