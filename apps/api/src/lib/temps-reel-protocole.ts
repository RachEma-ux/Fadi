/**
 * Temps réel — protocole du canal (RTC-1, Issue #283, décisions RT-D3 à RT-D5). Pur : aucun accès à la base ni au
 * réseau, testé par `temps-reel-protocole.test.ts`.
 *
 * Deux classes de messages (PLAN.md § 3) :
 * - **éphémères** (vue du présentateur, pointeur, sélection, suivi) : bornés en débit, jamais enregistrés, abandonnés
 *   sous charge ; un message périmé n'est pas rejoué ;
 * - **durables** (état de la session, transferts, révision, clôture) : numérotés (`seq`) pour la reprise ; ils
 *   n'annoncent qu'un fait déjà enregistré par les routes HTTP, jamais une écriture.
 *
 * Le serveur fournit l'auteur (`de`) et l'heure ; il ne relaie jamais le contenu brut d'un client : chaque message est
 * relu par son schéma, puis projeté pour chaque destinataire (`temps-reel-projection.ts`).
 */
import { z } from "zod";
import { STUDIO_FRAME_SCENES, validerElementVisualisation, type StudioCameraScene } from "@parcours/atelier-model";

export const VERSION_PROTOCOLE = 1;
/** Chemin unique de la montée de protocole (RT-D5 § 1). */
export const CHEMIN_CANAL = "/temps-reel";

/** Bornes de la première version (RT-D5 § 6) : techniques, pas des valeurs métier. */
export const BORNES_TEMPS_REEL = Object.freeze({
  octetsParMessage: 16 * 1024,
  messagesEphemeresParSeconde: 10,
  fileEnvoiOctets: 256 * 1024,
  battementMs: 10_000,
  participantsParSession: 50,
  connexionsParCompte: 20,
  objetsParSelection: 500,
  /** Revalidation des droits de chaque connexion ; une connexion non revalidée depuis `fraicheurDroitMs` ne reçoit rien. */
  revalidationMs: 2_000,
  fraicheurDroitMs: 3_000,
  rejeuEvenements: 500,
  rejeuMs: 5 * 60_000,
  hoteAbsentMs: 2 * 60_000,
  inactiviteMs: 30 * 60_000,
  dureeMaxMs: 12 * 3_600_000,
} as const);

/** Codes de fermeture applicatifs (4000–4999). */
export const FERMETURE = Object.freeze({
  nonAuthentifie: 4401,
  accesRetire: 4403,
  sessionIndisponible: 4404,
  battementManque: 4408,
  tropDeConnexions: 4409,
  fileSaturee: 4413,
  protocole: 4400,
  arretServeur: 1001,
} as const);

const identifiant = z.string().min(1).max(200).regex(/^[A-Za-z0-9_.:-]+$/);
const coordonnee = z.number().finite().min(-1e9).max(1e9);

/** Cadre de la vue plan (2D), dans le repère local du document Studio : coin bas-gauche et taille, mètres. */
const cadrePlan = z.object({ x: coordonnee, y: coordonnee, w: z.number().finite().positive().max(1e9), h: z.number().finite().positive().max(1e9) }).strict();
/**
 * Caméra 3D : même contrat que les scènes Studio (repère `local-3d`), relue par la validation publique d'une scène
 * (`validerElementVisualisation`) — aucune règle recopiée ici.
 */
const camera = z.unknown().transform((v, ctx): StudioCameraScene => {
  try {
    const scene = validerElementVisualisation({ id: "camera", type: "scene", frame: STUDIO_FRAME_SCENES, name: "camera", camera: v, visibleLayers: [], displayMode: "shaded" }, "vue");
    if (scene.type !== "scene") throw new Error("caméra attendue");
    return scene.camera;
  }
  catch (e) { ctx.addIssue({ code: "custom", message: (e as Error).message }); return z.NEVER; }
});
const affichage = z.enum(["2d", "3d", "double"]);

export const MESSAGE_CLIENT = z.discriminatedUnion("type", [
  z.object({ v: z.literal(VERSION_PROTOCOLE), type: z.literal("rejoindre"), sessionId: identifiant, depuis: z.number().int().min(0).optional() }).strict(),
  z.object({ v: z.literal(VERSION_PROTOCOLE), type: z.literal("quitter") }).strict(),
  z.object({ v: z.literal(VERSION_PROTOCOLE), type: z.literal("vue"), affichage, camera: camera.optional(), plan: cadrePlan.optional() }).strict(),
  z.object({ v: z.literal(VERSION_PROTOCOLE), type: z.literal("pointeur"), espace: z.enum(["plan", "3d"]), x: coordonnee, y: coordonnee, z: coordonnee.optional() }).strict(),
  z.object({ v: z.literal(VERSION_PROTOCOLE), type: z.literal("pointeur-masque") }).strict(),
  z.object({ v: z.literal(VERSION_PROTOCOLE), type: z.literal("selection"), objectIds: z.array(identifiant).max(BORNES_TEMPS_REEL.objetsParSelection) }).strict(),
  z.object({ v: z.literal(VERSION_PROTOCOLE), type: z.literal("suivre"), actif: z.boolean() }).strict(),
  z.object({ v: z.literal(VERSION_PROTOCOLE), type: z.literal("ping") }).strict(),
]);
export type MessageClient = z.infer<typeof MESSAGE_CLIENT>;
export type MessageEphemere = Extract<MessageClient, { type: "vue" | "pointeur" | "pointeur-masque" | "selection" | "suivre" }>;

/** Lecture d'un message brut : JSON, taille, schéma. Jamais d'exception ; le motif reste générique. */
export function lireMessage(brut: string | Buffer): { ok: true; message: MessageClient } | { ok: false; motif: "trop-gros" | "json" | "schema" } {
  const texte = typeof brut === "string" ? brut : brut.toString("utf8");
  if (Buffer.byteLength(texte, "utf8") > BORNES_TEMPS_REEL.octetsParMessage) return { ok: false, motif: "trop-gros" };
  let valeur: unknown;
  try { valeur = JSON.parse(texte); } catch { return { ok: false, motif: "json" }; }
  const r = MESSAGE_CLIENT.safeParse(valeur);
  return r.success ? { ok: true, message: r.data } : { ok: false, motif: "schema" };
}

export const estEphemere = (m: MessageClient): m is MessageEphemere => m.type === "vue" || m.type === "pointeur" || m.type === "pointeur-masque" || m.type === "selection" || m.type === "suivre";

/** Rôle d'une personne dans la session — jamais un droit (RT-R2). */
export type RoleSession = "hote" | "presentateur" | "participant";

export interface ParticipantPublic {
  userId: string;
  nom: string;
  roles: RoleSession[];
  suit: boolean;
  connexions: number;
}

export interface SessionPublique {
  id: string;
  portee: "studio-revision" | "paquet-revue";
  titre: string;
  studyId: string;
  variantId: string;
  revisionId: string;
  publicationId: string | null;
  hoteId: string;
  presentateurId: string | null;
  statut: "ouverte" | "close" | "expiree";
  expireLe: string;
}

/** Événements durables, numérotés par session (`seq`) pour la reprise. */
export type EvenementDurable =
  | { nature: "presentateur"; presentateurId: string | null; par: string }
  | { nature: "hote"; hoteId: string; par: string; reprise: boolean }
  | { nature: "revision-session"; revisionId: string; par: string }
  | { nature: "revision-disponible"; variantId: string; revisionId: string }
  | { nature: "session-close"; statut: "close" | "expiree"; par: string | null }
  | { nature: "annotation"; commentId: string; audience: "equipe" | "projet"; revisionId: string | null; auteurId: string };

export type MessageServeur =
  | { v: 1; type: "bienvenue"; connexionId: string; userId: string; battementMs: number }
  | { v: 1; type: "etat"; session: SessionPublique; participants: ParticipantPublic[]; seq: number; resynchronise: boolean; vue: VuePresentateur | null }
  | { v: 1; type: "evenement"; seq: number; evenement: EvenementDurable; at: string }
  | { v: 1; type: "vue"; de: string; affichage: "2d" | "3d" | "double"; camera?: StudioCameraScene; plan?: { x: number; y: number; w: number; h: number }; at: string }
  | { v: 1; type: "pointeur"; de: string; espace: "plan" | "3d"; x: number; y: number; z?: number }
  | { v: 1; type: "pointeur-masque"; de: string }
  | { v: 1; type: "selection"; de: string; objectIds: string[] }
  | { v: 1; type: "participants"; participants: ParticipantPublic[] }
  | { v: 1; type: "pong" }
  | { v: 1; type: "erreur"; code: CodeErreur; message: string };

export type VuePresentateur = Omit<Extract<MessageServeur, { type: "vue" }>, "v" | "type">;

export type CodeErreur = "message-invalide" | "session-indisponible" | "pas-en-session" | "session-pleine" | "deja-en-session" | "non-presentateur";

/** Messages d'erreur (français, traduits à l'affichage) : génériques, ils ne révèlent pas l'existence d'une ressource. */
export const MESSAGES_ERREUR: Readonly<Record<CodeErreur, string>> = Object.freeze({
  "message-invalide": "Message refusé : format non reconnu.",
  "session-indisponible": "Cette session n’est pas disponible.",
  "pas-en-session": "Rejoignez d’abord une session.",
  "session-pleine": "Cette session a atteint son nombre maximal de participants.",
  "deja-en-session": "Cette connexion est déjà dans une session.",
  "non-presentateur": "Seul le présentateur partage sa vue.",
});

/**
 * Limiteur de débit à fenêtre glissante d'une seconde (éphémères seulement) : au-delà de la borne, le message est
 * abandonné — jamais mis en attente, jamais rejoué.
 */
/**
 * Reprise de l'animation (RT-D5 § 5) : seulement quand le répartiteur sait l'hôte absent depuis deux minutes au moins.
 * Une absence inconnue (`null` : hôte connecté) refuse la reprise.
 */
export function repriseAutorisee(hoteAbsentDepuisMs: number | null): boolean {
  return hoteAbsentDepuisMs !== null && hoteAbsentDepuisMs >= BORNES_TEMPS_REEL.hoteAbsentMs;
}

export class LimiteurDebit {
  private instants: number[] = [];
  constructor(private readonly parSeconde: number = BORNES_TEMPS_REEL.messagesEphemeresParSeconde) {}
  accepter(maintenant: number): boolean {
    while (this.instants.length && maintenant - this.instants[0]! >= 1000) this.instants.shift();
    if (this.instants.length >= this.parSeconde) return false;
    this.instants.push(maintenant);
    return true;
  }
}

/** Journal de reprise d'une session : derniers événements durables, bornés en nombre et en âge (RT-D5 § 9). */
export class JournalReprise {
  private entrees: { seq: number; at: number; message: Extract<MessageServeur, { type: "evenement" }> }[] = [];
  private dernier = 0;
  get seq(): number { return this.dernier; }
  ajouter(evenement: EvenementDurable, maintenant: number): Extract<MessageServeur, { type: "evenement" }> {
    this.dernier += 1;
    const message = { v: 1 as const, type: "evenement" as const, seq: this.dernier, evenement, at: new Date(maintenant).toISOString() };
    this.entrees.push({ seq: this.dernier, at: maintenant, message });
    this.purger(maintenant);
    return message;
  }
  /** Événements postérieurs à `depuis`, ou `null` si une partie n'est plus disponible (resynchronisation). */
  depuis(depuis: number, maintenant: number): Extract<MessageServeur, { type: "evenement" }>[] | null {
    this.purger(maintenant);
    if (depuis > this.dernier) return null;
    if (depuis === this.dernier) return [];
    const premier = this.entrees[0];
    if (!premier || premier.seq > depuis + 1) return null;
    return this.entrees.filter((e) => e.seq > depuis).map((e) => e.message);
  }
  private purger(maintenant: number): void {
    while (this.entrees.length > BORNES_TEMPS_REEL.rejeuEvenements || (this.entrees[0] && maintenant - this.entrees[0].at > BORNES_TEMPS_REEL.rejeuMs)) this.entrees.shift();
  }
}
