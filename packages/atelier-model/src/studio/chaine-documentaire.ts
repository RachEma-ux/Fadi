import { STUDIO_DOSSIER_CONCEPTION_SCHEMA, STUDIO_FEUILLE_COMPOSEE_SCHEMA, type StudioDossierConception, type StudioFeuilleComposee } from "./dossier-conception.js";
import { studioSha256 } from "./empreinte-sha256.js";
import { studioJsonStable } from "./projections.js";
import { STUDIO_VUE_COUPE_SCHEMA, type StudioVueCoupe } from "./vues-coupe.js";

/**
 * Chaîne documentaire Studio (EX-074) et documents indépendants (EX-076). Pur : ni React, ni DOM, ni stockage.
 *
 * EX-074 — **Vue → Feuille → Dossier → Publication** : une vue (vue documentaire d'une planche, vue de coupe) est
 * assemblée sur une feuille composée (format et échelle déclarés, cartouche) ; les feuilles ordonnées forment un
 * dossier de conception ; le dossier se publie (manifeste figé, approbation, diffusion). Chaque maillon garde son rôle :
 * une **planche** est l'environnement de travail (le document d'une révision) et n'est jamais une feuille ; présentée
 * comme feuille publiée, elle est refusée (`planche_non_feuille`). Une feuille sans format ou sans échelle déclarés
 * l'est aussi (`feuille_incomplete`).
 *
 * EX-076 — un **dessin de détail créé directement en 2D** (origine `dessin-2d` : feuille composée d'une planche) peut
 * être publié avec des documents **dérivés d'une maquette** (origine `derive-maquette` : vue de coupe des solides) sans
 * être présenté comme un extrait automatiquement synchronisé. La présentation `extrait-synchronise` n'est admise que
 * pour une pièce dérivée de la maquette, ou pour une pièce 2D dont la source (variante, révision) est exactement celle
 * d'une pièce dérivée du même ensemble ; sinon elle est refusée (`synchronisation_non_fondee`). Chaque pièce garde sa
 * propre source : rien n'est fusionné ni recopié.
 */

export const STUDIO_PIECES_LIVRABLES_SCHEMA = "studio-pieces-livrables/1" as const;

export type StudioOriginePiece = "dessin-2d" | "derive-maquette";
export type StudioPresentationPiece = "document-independant" | "extrait-synchronise";
export const STUDIO_PRESENTATIONS_PIECE: readonly StudioPresentationPiece[] = Object.freeze(["document-independant", "extrait-synchronise"] as const);

/** Ce qu'on présente comme pièce publiée, tel que fourni (feuille, coupe, ou toute autre chose à refuser). */
export interface StudioPieceProposee {
  documentId: string;
  /** Rôle annoncé : feuille publiée ou vue de coupe. */
  presenteeComme: "feuille" | "vue-coupe";
  objet: unknown;
  presentation: StudioPresentationPiece;
}

export interface StudioSourcePiece { variantId: string; revisionId: string; documentHash: string }

export interface StudioPieceLivrable {
  ordre: number;
  documentId: string;
  nature: "feuille" | "vue-coupe";
  origine: StudioOriginePiece;
  presentation: StudioPresentationPiece;
  /** Sources propres de la pièce, jamais fusionnées avec celles des autres. */
  sources: StudioSourcePiece[];
  /** Feuille : format et échelle déclarés. */
  format?: string;
  echelle?: string;
  /** Empreinte propre de la pièce (feuille ou vue). */
  empreinte: string;
}

export type StudioRefusPiece =
  | { code: "planche_non_feuille"; documentId: string }
  | { code: "feuille_incomplete"; documentId: string; manque: ("format" | "echelle")[] }
  | { code: "vue_coupe_invalide"; documentId: string }
  | { code: "synchronisation_non_fondee"; documentId: string }
  | { code: "presentation_inconnue"; documentId: string }
  | { code: "piece_en_double"; documentId: string };

export const STUDIO_MESSAGES_REFUS_PIECE: Readonly<Record<StudioRefusPiece["code"], string>> = Object.freeze({
  planche_non_feuille: "Une planche est un environnement de travail : elle ne se publie pas comme feuille. Composez une feuille (format, échelle, cartouche) à partir de sa vue.",
  feuille_incomplete: "Une feuille publiée déclare son format et son échelle.",
  vue_coupe_invalide: "La vue de coupe proposée n'est pas une vue enregistrée.",
  synchronisation_non_fondee: "Ce dessin 2D n'est associé à aucune maquette de la publication : il ne peut pas être présenté comme un extrait synchronisé.",
  presentation_inconnue: "Présentation « document indépendant » ou « extrait synchronisé » attendue.",
  piece_en_double: "Une pièce figure deux fois dans la publication.",
});

const estObjet = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
/** Un document de révision (planche de travail) : identifiant, version de schéma, objets — et aucun schéma de feuille. */
const estPlanche = (v: unknown): boolean => estObjet(v) && Array.isArray(v.objects) && "schemaVersion" in v && v.schema === undefined;

/** Lecture d'une pièce proposée : sa nature réelle, son origine, ses sources et son empreinte ; sinon le refus. */
function lirePiece(p: StudioPieceProposee): Omit<StudioPieceLivrable, "ordre" | "presentation"> | StudioRefusPiece {
  const o = p.objet;
  if (p.presenteeComme === "feuille") {
    if (estPlanche(o) || !estObjet(o) || o.schema !== STUDIO_FEUILLE_COMPOSEE_SCHEMA) return { code: "planche_non_feuille", documentId: p.documentId };
    const f = o as unknown as StudioFeuilleComposee;
    const manque: ("format" | "echelle")[] = [];
    if (!f.definition?.format) manque.push("format");
    if (!f.definition?.echelle || !f.echelle) manque.push("echelle");
    if (manque.length) return { code: "feuille_incomplete", documentId: p.documentId, manque };
    const s = f.vue.source;
    return { documentId: p.documentId, nature: "feuille", origine: "dessin-2d", sources: [{ variantId: s.variantId, revisionId: s.revisionId, documentHash: s.documentHash }], format: f.definition.format, echelle: f.echelle, empreinte: f.empreinte };
  }
  if (!estObjet(o) || o.schema !== STUDIO_VUE_COUPE_SCHEMA) return { code: "vue_coupe_invalide", documentId: p.documentId };
  const v = o as unknown as StudioVueCoupe;
  return { documentId: p.documentId, nature: "vue-coupe", origine: "derive-maquette", sources: v.sources.map((s) => ({ variantId: s.variantId, revisionId: s.revisionId, documentHash: s.documentHash })), echelle: `1:${v.definition.echelle}`, empreinte: v.empreinte };
}

const cle = (s: StudioSourcePiece) => `${s.variantId}\u0000${s.revisionId}`;

/**
 * Contrôle et ordonne les pièces d'une publication : chaque pièce reconnue pour ce qu'elle est (une planche n'est jamais
 * une feuille), présentée sans synchronisation non fondée. Renvoie les pièces dans l'ordre donné, ou tous les refus.
 */
export function controlerPiecesLivrables(pieces: readonly StudioPieceProposee[]): { pieces: StudioPieceLivrable[] } | { refus: StudioRefusPiece[] } {
  const refus: StudioRefusPiece[] = [];
  const lues: (Omit<StudioPieceLivrable, "ordre" | "presentation"> & { presentation: StudioPresentationPiece })[] = [];
  const vus = new Set<string>();
  for (const p of pieces) {
    if (vus.has(p.documentId)) { refus.push({ code: "piece_en_double", documentId: p.documentId }); continue; }
    vus.add(p.documentId);
    if (!STUDIO_PRESENTATIONS_PIECE.includes(p.presentation)) { refus.push({ code: "presentation_inconnue", documentId: p.documentId }); continue; }
    const l = lirePiece(p);
    if ("code" in l) refus.push(l);
    else lues.push({ ...l, presentation: p.presentation });
  }
  // Association fondée : la source de la pièce 2D est celle d'une pièce dérivée de la maquette du même ensemble.
  const maquette = new Set(lues.filter((l) => l.origine === "derive-maquette").flatMap((l) => l.sources.map(cle)));
  for (const l of lues) {
    if (l.presentation === "extrait-synchronise" && l.origine === "dessin-2d" && !l.sources.every((s) => maquette.has(cle(s)))) {
      refus.push({ code: "synchronisation_non_fondee", documentId: l.documentId });
    }
  }
  if (refus.length) return { refus };
  return { pieces: lues.map((l, i) => ({ ordre: i + 1, ...l })) };
}

/** Pièces livrables d'un dossier : ses feuilles (dans l'ordre), puis ses vues de coupe. */
export function piecesDuDossier(
  dossier: StudioDossierConception, vues: readonly StudioVueCoupe[], presentations: Readonly<Record<string, StudioPresentationPiece>> = {},
): StudioPieceProposee[] {
  if (dossier?.schema !== STUDIO_DOSSIER_CONCEPTION_SCHEMA) throw new RangeError("dossier de conception attendu");
  return [
    ...dossier.feuilles.map((f) => ({ documentId: f.id, presenteeComme: "feuille" as const, objet: { schema: STUDIO_FEUILLE_COMPOSEE_SCHEMA, ...f }, presentation: presentations[f.id] ?? "document-independant" })),
    ...vues.map((v) => ({ documentId: v.id, presenteeComme: "vue-coupe" as const, objet: v, presentation: presentations[v.id] ?? "document-independant" })),
  ];
}

/** Chaîne documentaire d'un ensemble publié : vue → feuille → dossier → publication, chaque maillon avec son rôle. */
export interface StudioChaineDocumentaire {
  schema: typeof STUDIO_PIECES_LIVRABLES_SCHEMA;
  dossier: { id: string; titre: string; empreinte: string };
  pieces: StudioPieceLivrable[];
  /** Vues documentaires des feuilles (maillon « vue »), par feuille. */
  vues: { feuilleId: string; vueId: string; empreinteDonnees: string }[];
  /** SHA-256 de la chaîne (dossier, pièces, vues). */
  empreinte: string;
}

export function chaineDocumentaire(dossierId: string, dossier: StudioDossierConception, pieces: readonly StudioPieceLivrable[]): StudioChaineDocumentaire {
  const corps = {
    schema: STUDIO_PIECES_LIVRABLES_SCHEMA, dossier: { id: dossierId, titre: dossier.titre, empreinte: dossier.empreinte },
    pieces: pieces.map((p) => ({ ...p })), vues: dossier.feuilles.map((f) => ({ feuilleId: f.id, vueId: f.vue.id, empreinteDonnees: f.vue.empreinteDonnees })),
  };
  return { ...corps, empreinte: studioSha256(studioJsonStable(corps)) };
}
