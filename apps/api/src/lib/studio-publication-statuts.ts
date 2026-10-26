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
 *   - approbation (approuver, refuser) : besoin `approve` → propriétaire, ou rôle Approbateur de portée projet (phase 2
 *     de l'Issue #262, OP-D3 c) ;
 *   - publication (diffuser, retirer ; le remplacement suit la diffusion d'un paquet plus récent) : besoin `publish` →
 *     propriétaire, ou rôle Diffuseur de portée projet.
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
  lecture: "read", revue: "write", approbation: "approve", publication: "publish",
});
/**
 * Rôles de projet admis par capacité (documentation et indications d'interface ; le serveur revérifie). Approbation et
 * publication s'ouvrent aussi aux rôles métier Approbateur et Diffuseur (`canApprove`, `canPublish` de l'accès).
 */
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
/**
 * Contenu d'un dossier : `complet` (SVG, DXF, IFC, feuille PDF) ou `dessin-2d` (E.3-07 : dessin 2D indépendant, publié
 * sans modèle 3D — SVG, DXF et feuille PDF, sans IFC ni variante coordonnée).
 */
export type ContenuPublication = "complet" | "dessin-2d" | "dossier-conception";

/**
 * Références de règles, rapports de contrôle et observations bloquantes de l'ensemble publié (IF-009, lot PUB). Présent
 * dans le manifeste dès qu'il y a quelque chose à déclarer (forme historique inchangée sinon : mêmes empreintes).
 */
export interface ManifesteControles {
  /** Règles appliquées : version du jeu d'exigences de l'étude ; règles de métré d'un dossier qui joint un métré. */
  regles: { type: "exigences" | "metre"; id: string; version: string }[];
  /** Dernier contrôle enregistré de chaque révision source (exécution et conclusion normative, EX-068). */
  rapports: { controleId: string; variantId: string; revisionId: string; version: number | null; execution: string; conclusion: string | null; documentHash: string }[];
  /** Observations bloquantes des variantes sources, avec leur résolution (résolue, dérogée, ouverte). */
  observations: { issueId: string; observationId: string; variantId: string; gravite: "bloquante"; statut: string; resolution: "resolue" | "derogee" | "ouverte" }[];
}
/** Dossier de conception publié (EX-074) et ses pièces (EX-076), chacune avec son origine, sa présentation et ses sources. */
export interface ManifesteDossier {
  id: string;
  titre: string;
  empreinte: string;
  pieces: { ordre: number; documentId: string; nature: "feuille" | "vue-coupe"; origine: "dessin-2d" | "derive-maquette"; presentation: "document-independant" | "extrait-synchronise"; sources: { variantId: string; revisionId: string; documentHash: string }[]; empreinte: string;
    /** Vue de coupe incomplète : solides non coupés, absents de la page (absent : section complète). */
    omis?: string[] }[];
  /** Source du métré joint (absent : aucun métré) : elle entre dans le périmètre de contrôle (IF-009). */
  metre?: { variantId: string; revisionId: string; documentHash: string };
}
/**
 * Périmètre de contrôle d'un ensemble publié (IF-009) : sources du manifeste, plus chaque source des pièces du dossier
 * de conception et de son métré (feuille, vue de coupe ou quantités d'une autre variante comprises), sans doublon.
 */
export function perimetreControle(sources: readonly { variantId: string; revisionId: string }[], dossier: Pick<ManifesteDossier, "pieces" | "metre"> | null | undefined): { variantId: string; revisionId: string }[] {
  const out = new Map<string, { variantId: string; revisionId: string }>();
  const ajouter = (s: { variantId: string; revisionId: string }) => { const k = `${s.variantId}|${s.revisionId}`; if (!out.has(k)) out.set(k, { variantId: s.variantId, revisionId: s.revisionId }); };
  sources.forEach(ajouter);
  for (const p of dossier?.pieces ?? []) p.sources.forEach(ajouter);
  if (dossier?.metre) ajouter(dossier.metre);
  return [...out.values()];
}
export interface ManifestePublication {
  schema: "studio-publication-manifest/1";
  /** Absent : dossier complet (forme historique, empreintes inchangées) ; `dessin-2d` : dessin 2D indépendant ; `dossier-conception` : dossier de conception. */
  contenu?: "dessin-2d" | "dossier-conception";
  /** Intention / usage déclaré de la publication (IF-009) ; absent : non déclaré. */
  usage?: string;
  sources: ManifesteSource[];
  meta: ManifesteMeta;
  documents: ManifesteDocument[];
  /** IF-009 : règles, rapports de contrôle et observations bloquantes ; absent : rien à déclarer. */
  controles?: ManifesteControles;
  /** EX-074 / EX-076 : dossier de conception publié et ses pièces. */
  dossier?: ManifesteDossier;
}
/** Contenu d'un manifeste (absent : complet). */
export const contenuDe = (m: { contenu?: string } | null | undefined): ContenuPublication =>
  (m?.contenu === "dessin-2d" ? "dessin-2d" : m?.contenu === "dossier-conception" ? "dossier-conception" : "complet");
/**
 * Diffusions qu'une nouvelle diffusion remplace (E.4-06) : celles de MÊME contenu seulement. Un dessin 2D indépendant ne
 * remplace pas un paquet complet de la même variante, et inversement : chacun reste en vigueur pour son contenu.
 * Le contenu d'une ligne est lu sur son manifeste, à défaut sur son paquet (absent des deux : complet).
 */
export function memeContenu<T extends { manifest?: { contenu?: string } | null; package?: { contenu?: string } | null }>(contenu: ContenuPublication, autres: readonly T[]): T[] {
  return autres.filter((a) => contenuDe(a.manifest ?? a.package) === contenu);
}
/** Formats d'un paquet, dans l'ordre du paquet, selon son contenu : un dessin 2D indépendant ne porte pas d'IFC ; un dossier de conception porte son PDF et son JSON. */
export function formatsDuContenu(contenu: ContenuPublication): ("svg" | "dxf" | "ifc" | "pdf" | "json")[] {
  return contenu === "dessin-2d" ? ["svg", "dxf", "pdf"] : contenu === "dossier-conception" ? ["pdf", "json"] : ["svg", "dxf", "ifc", "pdf"];
}

/** Compléments du manifeste (IF-009, EX-074) : usage, contrôles, dossier ; chacun absent quand il n'y a rien à déclarer. */
export interface ComplementsManifeste { usage?: string | null; controles?: ManifesteControles | null; dossier?: ManifesteDossier | null }
const controlesVides = (c: ManifesteControles | null | undefined): boolean => !c || (!c.regles.length && !c.rapports.length && !c.observations.length);
/** Contrôles normalisés (ordre stable, champs connus seulement) ; null quand il n'y a rien à déclarer. */
export function normaliserControles(c: ManifesteControles | null | undefined): ManifesteControles | null {
  if (controlesVides(c)) return null;
  return {
    regles: [...c!.regles].sort((a, b) => (`${a.type}|${a.id}` < `${b.type}|${b.id}` ? -1 : 1)).map((r) => ({ type: r.type, id: r.id, version: r.version })),
    rapports: [...c!.rapports].sort((a, b) => (a.variantId < b.variantId ? -1 : a.variantId > b.variantId ? 1 : 0))
      .map((r) => ({ controleId: r.controleId, variantId: r.variantId, revisionId: r.revisionId, version: r.version, execution: r.execution, conclusion: r.conclusion, documentHash: r.documentHash })),
    observations: [...c!.observations].sort((a, b) => (a.issueId < b.issueId ? -1 : a.issueId > b.issueId ? 1 : 0))
      .map((o) => ({ issueId: o.issueId, observationId: o.observationId, variantId: o.variantId, gravite: o.gravite, statut: o.statut, resolution: o.resolution })),
  };
}

/** Manifeste normalisé : une seule source principale en tête, coordonnées triées et sans doublon, documents triés par format. */
export function construireManifeste(sources: readonly ManifesteSource[], meta: ManifesteMeta, documents: readonly ManifesteDocument[], contenu: ContenuPublication = "complet", complements: ComplementsManifeste = {}): ManifestePublication {
  const principales = sources.filter((s) => s.role === "principale");
  if (principales.length !== 1) throw new Error("studio_manifest_principal_source");
  const vus = new Set<string>([principales[0]!.variantId]);
  const coordonnees = sources.filter((s) => s.role === "coordonnee").filter((s) => (vus.has(s.variantId) ? false : (vus.add(s.variantId), true)))
    .sort((a, b) => (a.variantId < b.variantId ? -1 : a.variantId > b.variantId ? 1 : 0));
  const formats = new Set<string>();
  for (const d of documents) { if (formats.has(d.format)) throw new Error("studio_manifest_duplicate_document"); formats.add(d.format); }
  if (contenu === "dessin-2d" && coordonnees.length) throw new Error("studio_manifest_drawing_coordinated");
  if (contenu === "dessin-2d" && documents.some((d) => d.format === "ifc")) throw new Error("studio_manifest_drawing_ifc");
  if ((contenu === "dossier-conception") !== Boolean(complements.dossier)) throw new Error("studio_manifest_dossier");
  const c = complements.controles;
  return {
    schema: "studio-publication-manifest/1",
    ...(contenu !== "complet" ? { contenu } : {}),
    ...(complements.usage?.trim() ? { usage: complements.usage.trim() } : {}),
    sources: [principales[0]!, ...coordonnees].map((s) => ({ role: s.role, variantId: s.variantId, revisionId: s.revisionId, documentHash: s.documentHash })),
    meta: { projectCode: meta.projectCode, projectName: meta.projectName, studyName: meta.studyName, variantName: meta.variantName, revisionCreatedAt: meta.revisionCreatedAt },
    documents: [...documents].sort((a, b) => (a.format < b.format ? -1 : a.format > b.format ? 1 : 0))
      .map((d) => ({ format: d.format, fileName: d.fileName, mime: d.mime, size: d.size, sha256: d.sha256 })),
    ...(controlesVides(c) ? {} : { controles: normaliserControles(c!)! }),
    ...(complements.dossier ? { dossier: complements.dossier } : {}),
  };
}

/**
 * IF-009 : une publication n'est soumise, approuvée ni diffusée tant qu'une observation bloquante de l'ensemble n'est ni
 * résolue ni dérogée (409 `blocking_observation_open`, observations nommées). Null : rien ne bloque.
 */
export function controlerObservationsBloquantes(m: Pick<ManifestePublication, "controles"> | null | undefined): Refus | null {
  const ouvertes = (m?.controles?.observations ?? []).filter((o) => o.resolution === "ouverte");
  if (!ouvertes.length) return null;
  return { status: 409, body: {
    error: "blocking_observation_open", observations: ouvertes.map((o) => ({ issueId: o.issueId, observationId: o.observationId, variantId: o.variantId })),
    message: `${ouvertes.length} observation(s) bloquante(s) ni résolue(s) ni dérogée(s) : la publication est refusée.`,
  } };
}
/** Actions bloquées par une observation bloquante ouverte (le retrait, le refus et l'actualisation restent possibles). */
export const ACTIONS_BLOQUEES_PAR_OBSERVATION: readonly StudioPublicationTransition[] = Object.freeze(["soumettre", "approuver", "diffuser"]);
export const empreinteManifeste = (m: ManifestePublication): string => sha256(canonicalJson(m));

/** État courant d'une source : tête de la variante (null si la variante n'existe plus). */
export interface SourceCourante { variantId: string; headRevisionId: string | null }
export type EcartManifeste =
  | { type: "source"; role: RoleSource; variantId: string; revisionFigee: string; revisionCourante: string | null }
  | { type: "meta"; champ: keyof ManifesteMeta; figee: string; courante: string }
  /** Documents régénérés : mêmes sources et mêmes noms, mais octets d'export différents (exporteur modifié, par exemple). */
  | { type: "documents"; formats: string[] }
  /** IF-009 : règles, rapports de contrôle ou observations bloquantes changés depuis le manifeste (nouvelle approbation requise). */
  | { type: "controles" };

/**
 * Écarts entre le manifeste figé et l'état courant. Les révisions sont immuables : une tête inchangée garde son document
 * et son empreinte ; les métadonnées gelées entrent dans les exports, donc un renommage périme aussi le dossier ; enfin,
 * les documents régénérés (`documents`, quand l'appelant les a recalculés) sont comparés empreinte par empreinte.
 */
export function ecartsManifeste(m: ManifestePublication, courantes: readonly SourceCourante[], meta: Omit<ManifesteMeta, "revisionCreatedAt">, documents?: readonly ManifesteDocument[] | null, controles?: ManifesteControles | null): EcartManifeste[] {
  const tetes = new Map(courantes.map((c) => [c.variantId, c.headRevisionId]));
  const ecarts: EcartManifeste[] = [];
  for (const s of m.sources) {
    const tete = tetes.has(s.variantId) ? tetes.get(s.variantId)! : null;
    if (tete !== s.revisionId) ecarts.push({ type: "source", role: s.role, variantId: s.variantId, revisionFigee: s.revisionId, revisionCourante: tete });
  }
  for (const champ of ["projectCode", "projectName", "studyName", "variantName"] as const) {
    if (m.meta[champ] !== meta[champ]) ecarts.push({ type: "meta", champ, figee: m.meta[champ], courante: meta[champ] });
  }
  if (documents) {
    const formats = documentsRegeneres(m.documents, documents);
    if (formats.length) ecarts.push({ type: "documents", formats });
  }
  // Contrôles : comparés seulement quand l'appelant les a relus (`undefined` : non vérifiés).
  if (controles !== undefined && canonicalJson(normaliserControles(m.controles)) !== canonicalJson(normaliserControles(controles))) ecarts.push({ type: "controles" });
  return ecarts;
}
/** Formats dont le document recalculé diffère du document figé (empreinte, taille, nom ou type), ou qui manquent d'un côté. */
export function documentsRegeneres(figes: readonly ManifesteDocument[], courants: readonly ManifesteDocument[]): string[] {
  const cle = (d: ManifesteDocument) => canonicalJson({ fileName: d.fileName, mime: d.mime, size: d.size, sha256: d.sha256 });
  const a = new Map(figes.map((d) => [d.format, cle(d)]));
  const b = new Map(courants.map((d) => [d.format, cle(d)]));
  return [...new Set([...a.keys(), ...b.keys()])].filter((f) => a.get(f) !== b.get(f)).sort();
}
export const actualiteDe = (ecarts: readonly EcartManifeste[]): Actualite => (ecarts.length ? "perimee" : "a-jour");
/**
 * Actualité de référence d'un dossier : son manifeste figé a-t-il exactement l'empreinte du manifeste recalculé maintenant ?
 * Elle fait foi pour les transitions (actualiser est admis dès que les deux empreintes diffèrent, quelle qu'en soit la cause).
 */
export const actualiteParEmpreinte = (figee: string | null, courante: string): Actualite => (figee !== null && figee === courante ? "a-jour" : "perimee");

// --- Cache de régénération (vues de liste) ---------------------------------------------------------------------------

/**
 * Clé d'une régénération : empreinte du document de la révision figée, métadonnées figées (noms, date de révision), clé
 * IFC (étude | variante) et version des exporteurs. Mêmes entrées, mêmes octets : la clé ne dépend de rien d'autre.
 */
export function cleRegeneration(entree: { documentHash: string; meta: ManifesteMeta; ifcKey: string; versionExporteurs: string }): string {
  return sha256(canonicalJson({
    schema: "studio-regeneration/1", documentHash: entree.documentHash, ifcKey: entree.ifcKey, versionExporteurs: entree.versionExporteurs,
    meta: { projectCode: entree.meta.projectCode, projectName: entree.meta.projectName, studyName: entree.meta.studyName, variantName: entree.meta.variantName, revisionCreatedAt: entree.meta.revisionCreatedAt },
  }));
}

/** Cache borné (le plus ancien sort en premier) des empreintes de documents régénérés, en mémoire du processus. */
export class CacheRegeneration {
  private entrees = new Map<string, ManifesteDocument[]>();
  constructor(private readonly limite = 2000) {}
  get(cle: string): ManifesteDocument[] | undefined {
    const docs = this.entrees.get(cle);
    if (docs) { this.entrees.delete(cle); this.entrees.set(cle, docs); }
    return docs;
  }
  set(cle: string, docs: readonly ManifesteDocument[]): void {
    this.entrees.delete(cle);
    this.entrees.set(cle, docs.map((d) => ({ ...d })));
    while (this.entrees.size > this.limite) this.entrees.delete(this.entrees.keys().next().value!);
  }
  get taille(): number { return this.entrees.size; }
}

/** Contrôle des documents régénérés : `verifiee` (comparés), `non-verifiee` (vue de liste sans régénération en cache). */
export type ControleDocuments = "verifiee" | "non-verifiee";
/**
 * Actualité d'une vue : écarts de sources et de noms, plus les documents seulement s'ils sont connus. Sans documents
 * régénérés (cache absent en vue de liste), l'actualité reste celle des sources et des noms et les documents sont
 * déclarés « non vérifiée » — jamais « à jour » par défaut.
 */
export function actualiteVue(
  m: ManifestePublication, courantes: readonly SourceCourante[], meta: Omit<ManifesteMeta, "revisionCreatedAt">, documents: readonly ManifesteDocument[] | undefined,
  controles?: ManifesteControles | null,
): { ecarts: EcartManifeste[]; actualite: Actualite; documents: ControleDocuments } {
  const ecarts = ecartsManifeste(m, courantes, meta, documents ?? null, controles);
  return { ecarts, actualite: actualiteDe(ecarts), documents: documents ? "verifiee" : "non-verifiee" };
}

/**
 * Diffusion plus récente de la même variante qui remplace un dossier antérieur au lot E.4 (sans colonne de remplacement) :
 * la première diffusion en vigueur postérieure à la sienne, sinon null.
 */
export function diffusionPlusRecente(
  row: { id: string; variantId: string; diffusedAt: Date | null },
  autres: readonly { id: string; variantId: string; diffusedAt: Date | null; status: StatutCombine }[],
): string | null {
  if (!row.diffusedAt) return null;
  const t = row.diffusedAt.getTime();
  const later = autres.filter((d) => d.variantId === row.variantId && d.id !== row.id && d.diffusedAt && d.status === "diffuse" && d.diffusedAt.getTime() > t)
    .sort((x, y) => x.diffusedAt!.getTime() - y.diffusedAt!.getTime())[0];
  return later?.id ?? null;
}

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
