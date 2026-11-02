import { StudioValidationError } from "../noyau/validation.js";
import { validerCameraScene, STUDIO_FRAME_SCENES, type StudioCameraScene } from "./scenes.js";

/**
 * Provenance d'un rendu du modèle (lot E.5-03) : ce qu'un fichier PNG exporté de la vue 3D déclare de son origine —
 * étude, variante, révision (la révision affichée, historique comprise), scène, date d'export, caméra (repère
 * `local-3d`) — et la mention « rendu du modèle » : l'image est tirée de la géométrie du document, rien n'y est ajouté
 * ni inventé. Seul ce type de rendu existe ; une illustration assistée ou une exploration libre ne sont pas produites.
 * Pur : la date est fournie par l'appelant.
 *
 * EX-071 (lot PUB) : la provenance porte aussi l'**auteur** du rendu (compte qui l'exporte ; absent, le rendu est refusé
 * plutôt que d'inventer un auteur), les **paramètres** de rendu (taille du canevas, palier de qualité) et, si elle est
 * disponible, l'**empreinte** SHA-256 du document rendu ; une empreinte absente n'est jamais devinée.
 */

export const STUDIO_RENDU_SCHEMA = "studio-rendu/1" as const;
export const STUDIO_NATURE_RENDU = "rendu du modèle" as const;

export interface StudioProvenanceRendu {
  schema: typeof STUDIO_RENDU_SCHEMA;
  nature: typeof STUDIO_NATURE_RENDU;
  etude: { id: string; nom: string };
  variante: { id: string; nom: string };
  /** Révision enregistrée dont la géométrie est rendue. */
  revisionId: string;
  /** Scène rappelée ; null : vue courante, non enregistrée comme scène. */
  scene: { id: string; nom: string } | null;
  /** Date et heure de l'export, ISO 8601 (UTC). */
  date: string;
  repere: typeof STUDIO_FRAME_SCENES;
  camera: StudioCameraScene;
  /** Compte auteur du rendu (EX-071). */
  auteur: { id: string; email: string | null };
  /** Paramètres du rendu ; absents : non déclarés. */
  parametres?: ParametresRendu;
  /** Empreinte SHA-256 du document rendu, si disponible. */
  documentHash?: string;
}

export interface ParametresRendu {
  largeurPx: number;
  hauteurPx: number;
  /** Palier de qualité appliqué au rendu exporté. */
  qualite: string;
}

export interface EntreeProvenanceRendu {
  etude: { id: string; nom: string };
  variante: { id: string; nom: string };
  revisionId: string;
  scene: { id: string; nom: string } | null;
  date: Date;
  camera: StudioCameraScene;
  auteur: { id: string; email?: string | null } | null;
  parametres?: ParametresRendu;
  documentHash?: string;
}

function texte(v: unknown, path: string): string {
  if (typeof v !== "string" || !v.trim()) throw new StudioValidationError(path, "texte non vide attendu");
  return v;
}

/** Provenance validée ; refuse une révision, une étude ou une variante absentes plutôt que de les inventer. */
export function studioProvenanceRendu(e: EntreeProvenanceRendu): StudioProvenanceRendu {
  if (!(e.date instanceof Date) || Number.isNaN(e.date.getTime())) throw new StudioValidationError("provenance.date", "date valide attendue");
  if (!e.auteur) throw new StudioValidationError("provenance.auteur", "auteur du rendu attendu");
  const auteur = { id: texte(e.auteur.id, "provenance.auteur.id"), email: typeof e.auteur.email === "string" && e.auteur.email.trim() ? e.auteur.email : null };
  if (e.documentHash !== undefined && !/^[0-9a-f]{64}$/.test(e.documentHash)) throw new StudioValidationError("provenance.documentHash", "empreinte SHA-256 attendue");
  let parametres: ParametresRendu | undefined;
  if (e.parametres !== undefined) {
    const { largeurPx, hauteurPx, qualite } = e.parametres;
    if (![largeurPx, hauteurPx].every((n) => Number.isInteger(n) && n > 0 && n <= 32768)) throw new StudioValidationError("provenance.parametres", "taille du canevas en pixels attendue");
    parametres = { largeurPx, hauteurPx, qualite: texte(qualite, "provenance.parametres.qualite") };
  }
  return {
    schema: STUDIO_RENDU_SCHEMA, nature: STUDIO_NATURE_RENDU,
    etude: { id: texte(e.etude.id, "provenance.etude.id"), nom: texte(e.etude.nom, "provenance.etude.nom") },
    variante: { id: texte(e.variante.id, "provenance.variante.id"), nom: texte(e.variante.nom, "provenance.variante.nom") },
    revisionId: texte(e.revisionId, "provenance.revisionId"),
    scene: e.scene ? { id: texte(e.scene.id, "provenance.scene.id"), nom: texte(e.scene.nom, "provenance.scene.nom") } : null,
    date: e.date.toISOString(), repere: STUDIO_FRAME_SCENES, camera: validerCameraScene(e.camera, "provenance.camera"),
    auteur, ...(parametres ? { parametres } : {}), ...(e.documentHash !== undefined ? { documentHash: e.documentHash } : {}),
  };
}

const segment = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "x";

/** Nom du fichier : `rendu-<variante>-<scène|vue>-<8 derniers caractères de la révision>.png`. */
export function studioNomFichierRendu(p: StudioProvenanceRendu): string {
  return `rendu-${segment(p.variante.nom)}-${p.scene ? segment(p.scene.nom) : "vue"}-${segment(p.revisionId.slice(-8))}.png`;
}
