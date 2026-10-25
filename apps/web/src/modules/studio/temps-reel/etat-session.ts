/**
 * Temps réel — état d'une session côté client (RTC-2, Issue #283). Pur : ni React, ni DOM, ni réseau ; testé par
 * `etat-session.test.ts`. Il reflète ce que le serveur annonce (protocole v1, `apps/api/src/lib/temps-reel-protocole.ts`)
 * et ne décide d'aucun droit : l'hôte et le présentateur n'en ont aucun (RT-R2), le serveur filtre tout (RT-R7).
 */

export type Affichage = "2d" | "3d" | "double";
export interface Point3 { x: number; y: number; z: number }
export type CameraPartagee =
  | { projection: "perspective"; position: Point3; target: Point3; fov: number }
  | { projection: "orthographic"; position: Point3; target: Point3; height: number };
export interface CadrePartage { x: number; y: number; w: number; h: number }

export type RoleSession = "hote" | "presentateur" | "participant";
export interface Participant { userId: string; nom: string; roles: RoleSession[]; suit: boolean; connexions: number }
export interface SessionPublique {
  id: string; portee: "studio-revision" | "paquet-revue"; titre: string; studyId: string; variantId: string; revisionId: string;
  publicationId: string | null; hoteId: string; presentateurId: string | null; statut: "ouverte" | "close" | "expiree"; expireLe: string;
}
export interface VuePresentateur { de: string; affichage: Affichage; camera?: CameraPartagee; plan?: CadrePartage; at: string }

export type EvenementDurable =
  | { nature: "presentateur"; presentateurId: string | null; par: string }
  | { nature: "hote"; hoteId: string; par: string; reprise: boolean }
  | { nature: "revision-session"; revisionId: string; par: string }
  | { nature: "revision-disponible"; variantId: string; revisionId: string }
  | { nature: "session-close"; statut: "close" | "expiree"; par: string | null }
  | { nature: "annotation"; commentId: string; audience: "equipe" | "projet"; revisionId: string | null; auteurId: string };

export type MessageServeur =
  | { v: 1; type: "bienvenue"; connexionId: string; userId: string; battementMs: number }
  | { v: 1; type: "etat"; session: SessionPublique; participants: Participant[]; seq: number; resynchronise: boolean; vue: VuePresentateur | null }
  | { v: 1; type: "evenement"; seq: number; evenement: EvenementDurable; at: string }
  | ({ v: 1; type: "vue" } & VuePresentateur)
  | { v: 1; type: "pointeur"; de: string; espace: "plan" | "3d"; x: number; y: number; z?: number }
  | { v: 1; type: "pointeur-masque"; de: string }
  | { v: 1; type: "selection"; de: string; objectIds: string[] }
  | { v: 1; type: "participants"; participants: Participant[] }
  | { v: 1; type: "pong" }
  | { v: 1; type: "erreur"; code: string; message: string };

/** État de la connexion, toujours affiché (PLAN.md § 2 « Placement »). */
export type EtatConnexion = "hors-session" | "connexion" | "connecte" | "reconnexion" | "acces-retire" | "non-connecte" | "session-close" | "indisponible";

export interface PointeurDistant { userId: string; nom: string; espace: "plan" | "3d"; x: number; y: number; z?: number; at: number }

export interface EtatSession {
  connexion: EtatConnexion;
  moi: string | null;
  session: SessionPublique | null;
  participants: Participant[];
  vue: VuePresentateur | null;
  /** Numéro de vue reçue : la vue suivie ne se réapplique que quand il change. */
  vueN: number;
  seq: number;
  pointeurs: Record<string, PointeurDistant>;
  selections: Record<string, string[]>;
  /** Révision plus récente de la variante annoncée (jamais appliquée en silence). */
  revisionDisponible: string | null;
  /** Annotations annoncées depuis l'entrée (RTC-3) : identifiants des commentaires à relire par HTTP. */
  annotations: string[];
  erreur: string | null;
  resynchronise: boolean;
}

export const ETAT_INITIAL: EtatSession = Object.freeze({
  connexion: "hors-session", moi: null, session: null, participants: [], vue: null, vueN: 0, seq: 0, pointeurs: {}, selections: {},
  revisionDisponible: null, annotations: [], erreur: null, resynchronise: false,
}) as EtatSession;

/** Un pointeur distant disparaît après 10 s sans nouvelle position (jamais enregistré). */
export const DUREE_POINTEUR_MS = 10_000;

const nomDe = (e: EtatSession, userId: string) => e.participants.find((p) => p.userId === userId)?.nom ?? "";

export function recevoir(e: EtatSession, m: MessageServeur, maintenant: number): EtatSession {
  switch (m.type) {
    case "bienvenue": return { ...e, moi: m.userId };
    case "etat":
      return {
        ...e, connexion: "connecte", session: m.session, participants: m.participants, vue: m.vue, vueN: e.vueN + (m.vue ? 1 : 0), seq: m.seq,
        resynchronise: m.resynchronise, erreur: null, revisionDisponible: m.resynchronise ? null : e.revisionDisponible,
      };
    case "participants": {
      const presents = new Set(m.participants.map((p) => p.userId));
      const pointeurs = Object.fromEntries(Object.entries(e.pointeurs).filter(([id]) => presents.has(id)));
      const selections = Object.fromEntries(Object.entries(e.selections).filter(([id]) => presents.has(id)));
      return { ...e, participants: m.participants, pointeurs, selections };
    }
    case "vue": {
      const { v: _v, type: _t, ...vue } = m;
      return { ...e, vue, vueN: e.vueN + 1 };
    }
    case "pointeur":
      return { ...e, pointeurs: { ...e.pointeurs, [m.de]: { userId: m.de, nom: nomDe(e, m.de), espace: m.espace, x: m.x, y: m.y, ...(m.z !== undefined ? { z: m.z } : {}), at: maintenant } } };
    case "pointeur-masque": {
      const { [m.de]: _p, ...pointeurs } = e.pointeurs;
      return { ...e, pointeurs };
    }
    case "selection":
      return { ...e, selections: { ...e.selections, [m.de]: m.objectIds } };
    case "evenement": return evenement({ ...e, seq: Math.max(e.seq, m.seq) }, m.evenement);
    case "erreur": return { ...e, erreur: m.message };
    case "pong": return e;
  }
}

function evenement(e: EtatSession, ev: EvenementDurable): EtatSession {
  const s = e.session;
  switch (ev.nature) {
    case "presentateur": return s ? { ...e, session: { ...s, presentateurId: ev.presentateurId }, vue: null } : e;
    case "hote": return s ? { ...e, session: { ...s, hoteId: ev.hoteId } } : e;
    case "revision-session": return s ? { ...e, session: { ...s, revisionId: ev.revisionId }, revisionDisponible: null, vue: null, selections: {} } : e;
    case "revision-disponible": return s && ev.revisionId !== s.revisionId ? { ...e, revisionDisponible: ev.revisionId } : e;
    case "session-close": return { ...e, connexion: "session-close", session: s ? { ...s, statut: ev.statut } : s };
    case "annotation": return { ...e, annotations: e.annotations.includes(ev.commentId) ? e.annotations : [...e.annotations, ev.commentId] };
  }
}

/** Pointeurs encore frais (les autres sont oubliés à l'affichage). */
export function pointeursFrais(e: EtatSession, maintenant: number): PointeurDistant[] {
  return Object.values(e.pointeurs).filter((p) => maintenant - p.at <= DUREE_POINTEUR_MS);
}

export const estPresentateur = (e: EtatSession) => !!e.moi && e.session?.presentateurId === e.moi;
export const estHote = (e: EtatSession) => !!e.moi && e.session?.hoteId === e.moi;
export const nomPresentateur = (e: EtatSession) => (e.session?.presentateurId ? nomDe(e, e.session.presentateurId) : "");

/** Code de fermeture du canal → état affiché ; `null` : reconnexion automatique. */
export function etatApresFermeture(code: number): EtatConnexion | null {
  switch (code) {
    case 4401: return "non-connecte";
    case 4403: return "acces-retire";
    case 4404: return "session-close";
    case 4409: return "indisponible";
    default: return null;
  }
}

/** Attente avant la reconnexion n (1 s, 2 s, 4 s… 15 s au plus), avec une part aléatoire (`alea` ∈ [0, 1[). */
export function delaiReconnexion(n: number, alea: number): number {
  const base = Math.min(15_000, 1000 * 2 ** Math.max(0, n));
  return Math.round(base * (0.75 + 0.5 * alea));
}

/**
 * Regroupement des éphémères (≤ 10 par seconde, RT-D5 § 6) : la dernière valeur seulement part à chaque fenêtre de
 * 100 ms ; une valeur intermédiaire n'est jamais envoyée en retard.
 */
export class Regroupeur<T> {
  private enAttente: T | null = null;
  private dernier = Number.NEGATIVE_INFINITY;
  constructor(private readonly intervalleMs = 100) {}
  /** La valeur à envoyer maintenant, ou `null` (elle partira au prochain `tic`). */
  proposer(v: T, maintenant: number): T | null {
    if (maintenant - this.dernier >= this.intervalleMs) { this.dernier = maintenant; this.enAttente = null; return v; }
    this.enAttente = v;
    return null;
  }
  tic(maintenant: number): T | null {
    if (this.enAttente === null || maintenant - this.dernier < this.intervalleMs) return null;
    const v = this.enAttente;
    this.enAttente = null;
    this.dernier = maintenant;
    return v;
  }
}
