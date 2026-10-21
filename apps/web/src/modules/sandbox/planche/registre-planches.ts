/**
 * Planches nommées de Sandbox (menu de la Planche : Ouvrir, Nouvelle, Enregistrer sous, Renommer, Supprimer) : un
 * index (nom, niveau de référence, dates) et un document par Planche, tous dans ce navigateur (IndexedDB via
 * `localStore`), sous des clés qui n'appartiennent qu'à Sandbox. La première Planche, « le brouillon », garde la clé
 * historique `CLE_BROUILLON` : aucun dessin déjà conservé n'est perdu ni migré. Partie pure (index) séparée des
 * écritures. Lecture tolérante : un index illisible est ignoré (jamais une erreur bloquante) et recomposé.
 */
import { localStore } from "../../../lib/local-store";
import { cleDe } from "./brouillon";

export const FORMAT_INDEX = "sandbox-planches-index/1";
export const CLE_INDEX = "sandbox-planches-index";
/** Identifiant de la Planche historique (le brouillon d'origine de Sandbox). */
export const ID_BROUILLON = "brouillon";
/** Plafond de Planches nommées : borne la place prise dans ce navigateur (choix Fadi). */
export const PLANCHES_MAX = 50;

export interface InfoPlanche {
  readonly id: string;
  /** Nom choisi ; vide = nom par défaut (« Brouillon Sandbox »), affiché par l'interface. */
  readonly nom: string;
  /** Niveau de référence : altitude déclarée (m) mémorisée avec la Planche ; `null` = aucun. Jamais appliquée à la géométrie. */
  readonly altitudeRef: number | null;
  readonly creeA: string;
  readonly modifieA: string;
}

export interface IndexPlanches {
  readonly courante: string;
  readonly planches: readonly InfoPlanche[];
}

export function indexInitial(maintenant = new Date()): IndexPlanches {
  const d = maintenant.toISOString();
  return { courante: ID_BROUILLON, planches: [{ id: ID_BROUILLON, nom: "", altitudeRef: null, creeA: d, modifieA: d }] };
}

const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Index d'un texte sérialisé, ou `null` s'il est absent, d'un autre format ou mal formé. */
export function lireIndex(texte: string | null): IndexPlanches | null {
  if (!texte) return null;
  try {
    const brut: unknown = JSON.parse(texte);
    if (!estObjet(brut) || brut["format"] !== FORMAT_INDEX || !Array.isArray(brut["planches"]) || typeof brut["courante"] !== "string") return null;
    const planches: InfoPlanche[] = [];
    for (const p of brut["planches"]) {
      if (!estObjet(p) || typeof p["id"] !== "string" || typeof p["nom"] !== "string" || typeof p["creeA"] !== "string" || typeof p["modifieA"] !== "string") return null;
      const alt = p["altitudeRef"];
      if (alt !== null && !(typeof alt === "number" && Number.isFinite(alt))) return null;
      if (planches.some((x) => x.id === p["id"])) return null;
      planches.push({ id: p["id"], nom: p["nom"], altitudeRef: alt, creeA: p["creeA"], modifieA: p["modifieA"] });
    }
    if (planches.length === 0) return null;
    const courante = planches.some((p) => p.id === brut["courante"]) ? (brut["courante"] as string) : (planches[0] as InfoPlanche).id;
    return { courante, planches };
  } catch {
    return null;
  }
}

export const serialiserIndex = (idx: IndexPlanches): string => JSON.stringify({ format: FORMAT_INDEX, courante: idx.courante, planches: idx.planches });

export const planche = (idx: IndexPlanches, id: string = idx.courante): InfoPlanche => idx.planches.find((p) => p.id === id) ?? (idx.planches[0] as InfoPlanche);

/** Nouvel identifiant : horodatage + suffixe aléatoire, sans collision avec l'index. */
export function nouvelId(idx: IndexPlanches, alea: () => number = Math.random, maintenant = Date.now()): string {
  for (;;) {
    const id = `p${maintenant.toString(36)}${Math.floor(alea() * 36 ** 4).toString(36).padStart(4, "0")}`;
    if (!idx.planches.some((p) => p.id === id)) return id;
  }
}

/** Nom propre : espaces normalisés, vide refusé (le nom par défaut est réservé au brouillon d'origine), 80 caractères au plus. */
export function nomValide(nom: string): string | null {
  const n = nom.replace(/\s+/g, " ").trim();
  return n === "" ? null : n.slice(0, 80);
}

/** Altitude saisie (virgule ou point) : `""` = aucun niveau ; sinon un nombre fini, sinon `undefined` (saisie refusée). */
export function altitudeSaisie(texte: string): number | null | undefined {
  const s = texte.trim().replace(",", ".");
  if (s === "") return null;
  const x = Number(s);
  return Number.isFinite(x) ? x : undefined;
}

export function avecNouvelle(idx: IndexPlanches, info: InfoPlanche): IndexPlanches {
  if (idx.planches.length >= PLANCHES_MAX) throw new RangeError(`Au plus ${PLANCHES_MAX} Planches dans ce navigateur.`);
  return { courante: info.id, planches: [...idx.planches, info] };
}

export function avecInfo(idx: IndexPlanches, id: string, changes: Partial<Pick<InfoPlanche, "nom" | "altitudeRef" | "modifieA">>): IndexPlanches {
  return { ...idx, planches: idx.planches.map((p) => (p.id === id ? { ...p, ...changes } : p)) };
}

export function avecCourante(idx: IndexPlanches, id: string): IndexPlanches {
  return idx.planches.some((p) => p.id === id) ? { ...idx, courante: id } : idx;
}

/** Index sans la Planche `id` ; la suivante (ou la précédente) devient courante ; jamais vide (le brouillon d'origine revient). */
export function sansPlanche(idx: IndexPlanches, id: string, maintenant = new Date()): IndexPlanches {
  const pos = idx.planches.findIndex((p) => p.id === id);
  if (pos < 0) return idx;
  const reste = idx.planches.filter((p) => p.id !== id);
  if (reste.length === 0) return indexInitial(maintenant);
  const courante = idx.courante === id ? (reste[Math.min(pos, reste.length - 1)] as InfoPlanche).id : idx.courante;
  return { courante, planches: reste };
}

// --- Écritures locales (index seul ; les documents passent par `brouillon.ts`).

export async function chargerIndex(): Promise<IndexPlanches> {
  const texte = await localStore.getValueChecked(CLE_INDEX);
  const idx = lireIndex(texte);
  if (texte !== null && idx === null) throw new Error("Index des Planches illisible : conservation non confirmée.");
  return idx ?? indexInitial();
}

export async function enregistrerIndex(idx: IndexPlanches): Promise<void> {
  await localStore.setValueChecked(CLE_INDEX, serialiserIndex(idx));
}

export async function supprimerDocument(id: string): Promise<void> {
  await localStore.removeValue(cleDe(id));
}
