/**
 * Client des routes d'observations Studio (`/projects/:p/studio/studies/:s/variants/:v/observations`, E.2-01 à E.2-05).
 * Même origine, cookie de session ; un refus lève `ApiError` avec le code, le message et le corps du serveur (le corps
 * d'un 409 `deja_suivie` porte l'identifiant de l'observation à réemployer).
 */
import { ApiError, type CommentAudience, type StudioObservation, type StudioParticipant } from "../../../lib/api";

export type DomaineObservation = "exigence" | "metre" | "revue" | "objet";
export type VueObservation = "plan" | "3d" | "feuille" | "quantites" | "exigences" | "revue";
export type StatutTache = "a-faire" | "faite" | "annulee";
export type PassageTache = "terminer" | "annuler" | "rouvrir" | "reattribuer";
export type NatureDecision = "proposition" | "decision";
export type PorteeDecision = "cloture" | "autre" | "derogation";
/** IF-010 (lot PUB) : vocabulaires décidés ; absents : « non évaluée ». */
export type CategorieObservation = "coordination" | "conformite" | "geometrie" | "documentation" | "metre" | "autre";
export type GraviteObservation = "bloquante" | "majeure" | "mineure" | "information";
export const CATEGORIES_OBSERVATION: readonly CategorieObservation[] = ["coordination", "conformite", "geometrie", "documentation", "metre", "autre"];
export const GRAVITES_OBSERVATION: readonly GraviteObservation[] = ["bloquante", "majeure", "mineure", "information"];
export interface PieceObservation { name: string; mime: string; size: number; sha256: string }
export interface PieceSaisie { name: string; mime: "application/pdf" | "image/png" | "image/jpeg"; contentBase64: string }
export interface ReferenceBcf { guid: string; contexte: string; fichierSha256: string; importeLe: string }
export interface ImportBcfLu {
  contexte: string; crees: { guid: string; observationId: string; issueId: string }[]; reconnus: { guid: string; issueId: string }[];
  homonymes: { guid: string; issueIdsAutresContextes: string[] }[]; absents: { guid: string; issueId: string }[]; objetsInconnus: { guid: string; objets: string[] }[];
  avertissements: string[]; version: string | null;
}

export interface LienObservation { id: string; domaine: DomaineObservation; ref: string; revisionId: string | null; controleId: string | null; createdBy: string; createdAt: string }
export interface PassageTacheLu {
  seq: number; action: "creer" | PassageTache; fromStatut: StatutTache | null; toStatut: StatutTache; actorId: string; actorEmail: string;
  assigneeId: string | null; note: string | null; at: string;
}
export interface TacheObservation {
  id: string; libelle: string; assigneeId: string; assigneeEmail: string; echeance: string | null; statut: StatutTache; createdBy: string;
  createdAt: string; updatedAt: string; journal: PassageTacheLu[]; assignedToMe: boolean; possibles: PassageTache[];
}
export interface DecisionObservation {
  seq: number; nature: NatureDecision; portee: PorteeDecision; texte: string; actorId: string; actorEmail: string; actorRole: "proprietaire" | "editeur";
  revisionId: string | null; at: string;
}
/** Observation lue du serveur, qui fait autorité (droits relus : `possibles`, `peut`). */
export interface ObservationSuivie extends StudioObservation {
  body: string;
  authorEmail: string;
  /** Audience du fil (écart E1), absente d'un serveur plus ancien (= tout le projet). */
  audience?: CommentAudience;
  contexte: { projectId: string; studyId: string; variantId: string; revisionId: string | null; objectIds: string[] };
  vue: { mode: VueObservation; ref: string | null } | null;
  liens: LienObservation[];
  taches: TacheObservation[];
  decisions: DecisionObservation[];
  peut: { lier: boolean; creerTache: boolean; proposer: boolean; decider: boolean };
  /** IF-010 / EX-084 : identité propre, distincte de la note d'origine (`id`). */
  issueId?: string;
  categorie?: CategorieObservation | null;
  gravite?: GraviteObservation | null;
  pieces?: PieceObservation[];
  bcfRefs?: ReferenceBcf[];
  /** IF-009 : résolution pour une publication. */
  resolution?: "resolue" | "derogee" | "ouverte";
}
export interface LectureObservations { observations: ObservationSuivie[]; participants: StudioParticipant[]; archived: boolean; me: { id: string; role: string } }

export interface LienSaisi { domaine: DomaineObservation; ref: string; revisionId?: string; controleId?: string }
export interface OuvertureSaisie {
  body: string; revisionId?: string; objectIds?: string[]; responsableId: string; echeance?: string; note?: string;
  vue?: { mode: VueObservation; ref?: string }; liens?: LienSaisi[]; requestId: string; audience?: CommentAudience;
  categorie?: CategorieObservation; gravite?: GraviteObservation; pieces?: PieceSaisie[];
}

async function appel<T>(chemin: string, init?: RequestInit): Promise<T> {
  const res = await fetch(chemin, { ...init, credentials: "include", headers: { "Content-Type": "application/json", ...init?.headers } });
  const corps: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const c = (corps ?? {}) as { error?: unknown; message?: unknown };
    throw new ApiError(res.status, typeof c.error === "string" ? c.error : `http_${res.status}`, typeof c.message === "string" ? c.message : null, corps);
  }
  return corps as T;
}
const e = encodeURIComponent;
const base = (p: string, s: string, v: string) => `/projects/${e(p)}/studio/studies/${e(s)}/variants/${e(v)}/observations`;
const post = <T>(chemin: string, corps: unknown) => appel<T>(chemin, { method: "POST", body: JSON.stringify(corps) });
type Ecrite = ObservationSuivie & { replayed: boolean };

/** Rapprochement consigné d'une observation avec une révision ultérieure (EX-086) ; le statut de l'observation est inchangé. */
export type SuiviRapprochement = "objet-disparu" | "persiste" | "a-recontroler" | "non-rapprochable";
export interface RapprochementLu {
  id: string; observationId: string; revisionId: string; checkId: string | null; observationStatus: string; suivi: SuiviRapprochement;
  elements: { domaine: string; ref: string; issue: string }[]; actor: { id: string; email: string }; createdAt: string;
}

export const apiObservations = {
  /** Adresse de l'export BCF 2.1 minimal des observations lisibles (IF-010). */
  urlExportBcf: (p: string, s: string, v: string) => `${base(p, s, v)}/bcf`,
  /** Adresse d'une pièce justificative (contenu vérifié par son empreinte). */
  urlPiece: (p: string, s: string, v: string, id: string, sha256: string) => `${base(p, s, v)}/${e(id)}/pieces/${e(sha256)}`,
  /** Import d'un fichier BCF : seuls les sujets nouveaux dans leur contexte deviennent des observations. */
  importerBcf: (p: string, s: string, v: string, fichierBase64: string) => post<ImportBcfLu>(`${base(p, s, v)}/bcf`, { fichierBase64 }),
  /** Rapprochements consignés de la variante (EX-086). */
  rapprochements: (p: string, s: string, v: string) => appel<{ rapprochements: RapprochementLu[] }>(`${base(p, s, v)}/rapprochements`),
  /** Rapprochement sur demande avec une révision (tête par défaut) : aucun statut d'observation n'est modifié. */
  rapprocher: (p: string, s: string, v: string, revisionId?: string) =>
    post<{ revisionId: string; checkId: string | null; resultats: { observationId: string; suivi: SuiviRapprochement; statut: string }[] }>(`${base(p, s, v)}/rapprochements`, revisionId ? { revisionId } : {}),
  lire: (p: string, s: string, v: string) => appel<LectureObservations>(base(p, s, v)),
  /** L'observation qui suit cet élément d'un domaine (au plus une : identité réemployée). */
  suivie: (p: string, s: string, v: string, domaine: DomaineObservation, ref: string) => appel<LectureObservations>(`${base(p, s, v)}?domaine=${e(domaine)}&ref=${e(ref)}`),
  ouvrir: (p: string, s: string, v: string, corps: OuvertureSaisie) => post<Ecrite>(base(p, s, v), corps),
  lier: (p: string, s: string, v: string, id: string, corps: LienSaisi & { requestId: string }) => post<Ecrite>(`${base(p, s, v)}/${e(id)}/liens`, corps),
  creerTache: (p: string, s: string, v: string, id: string, corps: { libelle: string; assigneeId: string; echeance?: string; note?: string; requestId: string }) =>
    post<Ecrite>(`${base(p, s, v)}/${e(id)}/taches`, corps),
  passerTache: (p: string, s: string, v: string, id: string, tacheId: string, corps: { action: PassageTache; assigneeId?: string; note?: string; requestId: string }) =>
    post<Ecrite>(`${base(p, s, v)}/${e(id)}/taches/${e(tacheId)}/transitions`, corps),
  decider: (p: string, s: string, v: string, id: string, corps: { nature: NatureDecision; portee: PorteeDecision; texte: string; revisionId?: string; requestId: string }) =>
    post<Ecrite>(`${base(p, s, v)}/${e(id)}/decisions`, corps),
};
