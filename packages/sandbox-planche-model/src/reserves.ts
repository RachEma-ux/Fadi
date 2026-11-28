/**
 * Réserves de chantier (cas 4 du catalogue des extensions, étape 7b : D11-F18-037 ; maquette
 * `analyses/catalogue-extensions/cas-4/maquettes/etape-7-hote.png`, quart 7b).
 *
 * Une réserve est épinglée en un point du modèle, sur l'objet visé s'il y en a un : numéro, lot, entreprise, description,
 * échéance (date saisie ou vide), statut (ouverte ou levée), date de levée, photo jointe (JPEG réduit, prise par la
 * tablette). Toutes les valeurs sont saisies : Fadi n'en invente aucune (une échéance vide reste vide). La liste se
 * filtre par lot et par statut. Préfixe d'identifiant « q ».
 */
import type { Id, Modele } from "./geometrie-libre.js";
import { modifierAnnotations } from "./geometrie-libre.js";
import type { Vec3 } from "./vecteur.js";

export type StatutReserve = "ouverte" | "levee";
export const STATUTS_RESERVE: readonly StatutReserve[] = ["ouverte", "levee"];

export interface Reserve {
  readonly id: Id;
  /** Numéro d'ordre (1, 2, …), jamais réattribué. */
  readonly numero: number;
  readonly point: Vec3;
  /** Occurrence de la racine visée au moment de la pose ; null = point libre. */
  readonly objet: Id | null;
  readonly lot: string;
  readonly entreprise: string;
  readonly description: string;
  /** Échéance « AAAA-MM-JJ » ou "" (non saisie). */
  readonly echeance: string;
  readonly statut: StatutReserve;
  /** Date de levée « AAAA-MM-JJ » (statut levée) ; null sinon. */
  readonly levee: string | null;
  /** Date de création « AAAA-MM-JJ ». */
  readonly creee: string;
  /** Photo jointe : data:image/jpeg;base64,… ; null = aucune. */
  readonly photo: string | null;
}

export const TEXTE_RESERVE_MAX = 120;
export const DESCRIPTION_RESERVE_MAX = 2000;
/** Taille maximale de la photo encodée (caractères) : une image de 1 280 px en JPEG reste bien en deçà. */
export const PHOTO_RESERVE_MAX = 1_500_000;

export type ErreurReserve = "texte" | "description" | "date" | "photo" | "statut" | "point" | "absent";

const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
export const estDateJour = (v: unknown): v is string => typeof v === "string" && DATE.test(v);
const texte = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;
const fini = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const estPoint = (v: unknown): v is Vec3 => typeof v === "object" && v !== null && fini((v as Vec3).x) && fini((v as Vec3).y) && fini((v as Vec3).z);
const estPhoto = (v: unknown): v is string | null => v === null || (typeof v === "string" && v.length <= PHOTO_RESERVE_MAX && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v));

/** Réserve reçue (document, delta) : jamais crue sur parole. */
export function estReserve(id: Id, v: unknown): v is Reserve {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const r = v as Record<string, unknown>;
  return (
    r["id"] === id &&
    /^q[0-9a-z]+$/.test(id) &&
    Number.isInteger(r["numero"]) &&
    (r["numero"] as number) > 0 &&
    estPoint(r["point"]) &&
    (r["objet"] === null || typeof r["objet"] === "string") &&
    texte(r["lot"], TEXTE_RESERVE_MAX) &&
    texte(r["entreprise"], TEXTE_RESERVE_MAX) &&
    texte(r["description"], DESCRIPTION_RESERVE_MAX) &&
    (r["echeance"] === "" || estDateJour(r["echeance"])) &&
    STATUTS_RESERVE.includes(r["statut"] as StatutReserve) &&
    (r["statut"] === "levee" ? estDateJour(r["levee"]) : r["levee"] === null) &&
    estDateJour(r["creee"]) &&
    estPhoto(r["photo"])
  );
}

export type ResultatReserve = { readonly ok: true; readonly modele: Modele; readonly id: Id } | { readonly ok: false; readonly erreur: ErreurReserve };

export const reservesDe = (m: Modele): Reserve[] => Object.values(m.annotations?.reserves ?? {}).sort((a, b) => a.numero - b.numero);

/** Numéro suivant : le plus grand déjà donné + 1 (un numéro supprimé n'est jamais redonné tant qu'un plus grand existe). */
export const numeroReserveSuivant = (m: Modele): number => reservesDe(m).reduce((n, r) => Math.max(n, r.numero), 0) + 1;

type Champs = Pick<Reserve, "lot" | "entreprise" | "description" | "echeance" | "photo">;

function verifier(c: Champs): ErreurReserve | null {
  if (!texte(c.lot, TEXTE_RESERVE_MAX) || !texte(c.entreprise, TEXTE_RESERVE_MAX)) return "texte";
  if (!texte(c.description, DESCRIPTION_RESERVE_MAX)) return "description";
  if (c.echeance !== "" && !estDateJour(c.echeance)) return "date";
  if (!estPhoto(c.photo)) return "photo";
  return null;
}

/** Pose une réserve ouverte (un pas) ; `aujourdhui` = date du jour « AAAA-MM-JJ », fournie par l'interface. */
export function creerReserve(m: Modele, v: { readonly point: Vec3; readonly objet: Id | null; readonly aujourdhui: string } & Partial<Champs>): ResultatReserve {
  if (!estPoint(v.point)) return { ok: false, erreur: "point" };
  if (!estDateJour(v.aujourdhui)) return { ok: false, erreur: "date" };
  const c: Champs = { lot: (v.lot ?? "").trim(), entreprise: (v.entreprise ?? "").trim(), description: v.description ?? "", echeance: v.echeance ?? "", photo: v.photo ?? null };
  const e = verifier(c);
  if (e) return { ok: false, erreur: e };
  const numero = numeroReserveSuivant(m);
  let id = "" as Id;
  const modele = modifierAnnotations(m, (a, nouvel) => {
    id = nouvel("q");
    a.reserves[id] = { id, numero, point: v.point, objet: v.objet, ...c, statut: "ouverte", levee: null, creee: v.aujourdhui };
  }).modele;
  return { ok: true, modele, id };
}

/** Modifie la fiche (lot, entreprise, description, échéance, photo) en un pas. */
export function modifierReserve(m: Modele, id: Id, v: Partial<Champs>): ResultatReserve {
  const r = m.annotations?.reserves?.[id];
  if (!r) return { ok: false, erreur: "absent" };
  const c: Champs = { lot: (v.lot ?? r.lot).trim(), entreprise: (v.entreprise ?? r.entreprise).trim(), description: v.description ?? r.description, echeance: v.echeance ?? r.echeance, photo: v.photo === undefined ? r.photo : v.photo };
  const e = verifier(c);
  if (e) return { ok: false, erreur: e };
  return { ok: true, modele: modifierAnnotations(m, (a) => void (a.reserves[id] = { ...r, ...c })).modele, id };
}

/** Lève une réserve ouverte (datée du jour) ou rouvre une réserve levée, en un pas. */
export function leverReserve(m: Modele, id: Id, aujourdhui: string): ResultatReserve {
  const r = m.annotations?.reserves?.[id];
  if (!r) return { ok: false, erreur: "absent" };
  if (!estDateJour(aujourdhui)) return { ok: false, erreur: "date" };
  const suivante: Reserve = r.statut === "ouverte" ? { ...r, statut: "levee", levee: aujourdhui } : { ...r, statut: "ouverte", levee: null };
  return { ok: true, modele: modifierAnnotations(m, (a) => void (a.reserves[id] = suivante)).modele, id };
}

export function supprimerReserve(m: Modele, id: Id): ResultatReserve {
  if (!m.annotations?.reserves?.[id]) return { ok: false, erreur: "absent" };
  return { ok: true, modele: modifierAnnotations(m, (a) => void delete a.reserves[id]).modele, id };
}

/** Lots déjà saisis (pour le filtre), triés, sans doublon ; le lot vide n'y figure pas. */
export const lotsDesReserves = (m: Modele): string[] => [...new Set(reservesDe(m).map((r) => r.lot).filter((l) => l !== ""))].sort((a, b) => a.localeCompare(b, "fr"));

export interface FiltreReserves {
  /** null = tous les lots. */
  readonly lot: string | null;
  /** null = ouvertes et levées. */
  readonly statut: StatutReserve | null;
}

export const filtrerReserves = (liste: readonly Reserve[], f: FiltreReserves): Reserve[] => liste.filter((r) => (f.lot === null || r.lot === f.lot) && (f.statut === null || r.statut === f.statut));

/** Une réserve est en retard quand elle est ouverte et que son échéance saisie est passée (échéance vide : jamais). */
export const enRetard = (r: Reserve, aujourdhui: string): boolean => r.statut === "ouverte" && r.echeance !== "" && r.echeance < aujourdhui;
