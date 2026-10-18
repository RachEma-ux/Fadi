/**
 * Document 2D canonique de Studio (lot A, orientation DEC-01 « document 2D autonome ») : primitives, calques et cotes
 * font autorité, jamais leur rendu. Unité et repère explicites (mètre, repère du document, y vers le haut) ; un pixel
 * n'est jamais une unité canonique. Pur : ni React, ni DOM, ni stockage. Partagé par le serveur (validation de chaque
 * révision) et le navigateur (édition, annulation locale, accrochage).
 */

export const SCHEMA_DOCUMENT2D = "studio.document2d/1";

export type Point = { x: number; y: number };
export type Extremite = "a" | "b";
/** Lien d'une extrémité de cote vers l'extrémité d'une ligne : la cote suit la ligne. */
export type LienCote = { primitiveId: string; extremite: Extremite } | null;

export interface Calque {
  id: string;
  nom: string;
  visible: boolean;
  verrouille: boolean;
}
export interface Ligne {
  id: string;
  type: "ligne";
  calqueId: string;
  a: Point;
  b: Point;
}
/** Cote linéaire alignée : la valeur est dérivée (distance a–b), jamais saisie ; `decalage` est signé, en mètres. */
export interface Cote {
  id: string;
  type: "cote";
  calqueId: string;
  a: Point;
  b: Point;
  decalage: number;
  liens: { a: LienCote; b: LienCote };
  /** Une ligne cotée a disparu : la cote reste, à résoudre — jamais rattachée arbitrairement à une autre. */
  aResoudre: boolean;
}
export type Primitive = Ligne | Cote;

export interface ContenuDocument2D {
  schemaVersion: typeof SCHEMA_DOCUMENT2D;
  unite: "m";
  calques: Calque[];
  primitives: Primitive[];
}

export const LIMITES_DOCUMENT2D = { calques: 200, primitives: 20_000, nom: 80 } as const;
const ID = /^[A-Za-z0-9_-]{1,64}$/;

export function documentVide(): ContenuDocument2D {
  return { schemaVersion: SCHEMA_DOCUMENT2D, unite: "m", calques: [{ id: "calque-1", nom: "Calque 1", visible: true, verrouille: false }], primitives: [] };
}

export const distance = (p: Point, q: Point): number => Math.hypot(q.x - p.x, q.y - p.y);
export const milieu = (p: Point, q: Point): Point => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
const egal = (p: Point, q: Point) => p.x === q.x && p.y === q.y;

// ——— Validation (serveur et client) ———

export type Validation = { ok: true; contenu: ContenuDocument2D } | { ok: false; erreurs: string[] };

const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const estPoint = (v: unknown): v is Point => estObjet(v) && Number.isFinite(v["x"]) && Number.isFinite(v["y"]) && Object.keys(v).length === 2;

/** Refuse tout ce qui n'est pas exactement un document conforme ; aucune valeur absente n'est complétée par défaut. */
export function validerDocument2D(v: unknown): Validation {
  const erreurs: string[] = [];
  if (!estObjet(v)) return { ok: false, erreurs: ["document : objet attendu"] };
  if (v["schemaVersion"] !== SCHEMA_DOCUMENT2D) erreurs.push(`schemaVersion : « ${SCHEMA_DOCUMENT2D} » attendu`);
  if (v["unite"] !== "m") erreurs.push("unite : « m » attendu (unité déclarée explicitement)");
  const calques = v["calques"];
  const primitives = v["primitives"];
  if (!Array.isArray(calques) || calques.length === 0 || calques.length > LIMITES_DOCUMENT2D.calques) erreurs.push(`calques : 1 à ${LIMITES_DOCUMENT2D.calques} attendus`);
  if (!Array.isArray(primitives) || primitives.length > LIMITES_DOCUMENT2D.primitives) erreurs.push(`primitives : au plus ${LIMITES_DOCUMENT2D.primitives}`);
  if (erreurs.length) return { ok: false, erreurs };
  const idsCalques = new Set<string>();
  for (const [i, c] of (calques as unknown[]).entries()) {
    if (!estObjet(c) || typeof c["id"] !== "string" || !ID.test(c["id"]) || typeof c["nom"] !== "string" || c["nom"].trim() === "" || c["nom"].length > LIMITES_DOCUMENT2D.nom || typeof c["visible"] !== "boolean" || typeof c["verrouille"] !== "boolean") {
      erreurs.push(`calques[${i}] : id, nom, visible et verrouille requis`);
      continue;
    }
    if (idsCalques.has(c["id"])) erreurs.push(`calques[${i}] : identifiant « ${c["id"]} » en double`);
    idsCalques.add(c["id"]);
  }
  const lignes = new Map<string, Ligne>();
  const ids = new Set<string>();
  for (const [i, p] of (primitives as unknown[]).entries()) {
    if (!estObjet(p) || typeof p["id"] !== "string" || !ID.test(p["id"])) {
      erreurs.push(`primitives[${i}] : identifiant invalide`);
      continue;
    }
    if (ids.has(p["id"])) erreurs.push(`primitives[${i}] : identifiant « ${p["id"]} » en double`);
    ids.add(p["id"]);
    if (typeof p["calqueId"] !== "string" || !idsCalques.has(p["calqueId"])) erreurs.push(`primitives[${i}] : calque inconnu`);
    if (!estPoint(p["a"]) || !estPoint(p["b"])) {
      erreurs.push(`primitives[${i}] : points a et b finis requis`);
      continue;
    }
    if (egal(p["a"], p["b"])) erreurs.push(`primitives[${i}] : longueur nulle`);
    if (p["type"] === "ligne") {
      if (Object.keys(p).length !== 5) erreurs.push(`primitives[${i}] : champ inattendu`);
      lignes.set(p["id"], p as unknown as Ligne);
    } else if (p["type"] === "cote") {
      const liens = p["liens"];
      if (!Number.isFinite(p["decalage"]) || typeof p["aResoudre"] !== "boolean" || !estObjet(liens) || !("a" in liens) || !("b" in liens) || Object.keys(p).length !== 8) erreurs.push(`primitives[${i}] : cote incomplète (decalage, liens, aResoudre)`);
    } else erreurs.push(`primitives[${i}] : type inconnu`);
  }
  // Les liens de cote se vérifient après lecture de toutes les lignes : cible existante, extrémité exacte.
  for (const [i, p] of (primitives as Record<string, unknown>[]).entries()) {
    if (p?.["type"] !== "cote" || !estObjet(p["liens"])) continue;
    for (const ext of ["a", "b"] as const) {
      const lien = (p["liens"] as Record<string, unknown>)[ext];
      if (lien === null) continue;
      if (!estObjet(lien) || typeof lien["primitiveId"] !== "string" || (lien["extremite"] !== "a" && lien["extremite"] !== "b")) {
        erreurs.push(`primitives[${i}] : lien ${ext} invalide`);
        continue;
      }
      const cible = lignes.get(lien["primitiveId"]);
      if (!cible) erreurs.push(`primitives[${i}] : lien ${ext} vers une ligne absente`);
      else if (estPoint(p[ext]) && !egal(p[ext] as Point, cible[lien["extremite"] as Extremite])) erreurs.push(`primitives[${i}] : extrémité ${ext} différente de la ligne liée`);
    }
  }
  return erreurs.length ? { ok: false, erreurs } : { ok: true, contenu: v as unknown as ContenuDocument2D };
}

/** Texte canonique (clés triées) d'où l'empreinte du contenu est calculée ; ne décide pas la canonicalisation de publication (DEC-16). */
export function canoniserDocument2D(v: unknown): string {
  const trier = (x: unknown): unknown => (Array.isArray(x) ? x.map(trier) : estObjet(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, trier(x[k])])) : x);
  return JSON.stringify(trier(v));
}

// ——— Commandes d'édition : chacune rend un nouveau document ou un refus, jamais une modification partielle ———

export type Resultat = { ok: true; contenu: ContenuDocument2D } | { ok: false; erreur: string };

const calqueEditable = (doc: ContenuDocument2D, calqueId: string): string | null => {
  const calque = doc.calques.find((c) => c.id === calqueId);
  if (!calque) return "Calque inconnu.";
  if (calque.verrouille) return "Calque verrouillé.";
  return null;
};
const pointsValides = (a: Point, b: Point): string | null => (![a.x, a.y, b.x, b.y].every(Number.isFinite) ? "Coordonnée invalide." : egal(a, b) ? "Longueur nulle." : null);
const idLibre = (doc: ContenuDocument2D, id: string): string | null => (!ID.test(id) ? "Identifiant invalide." : doc.primitives.some((p) => p.id === id) ? "Identifiant déjà utilisé." : null);

export function ajouterLigne(doc: ContenuDocument2D, l: { id: string; calqueId: string; a: Point; b: Point }): Resultat {
  const refus = idLibre(doc, l.id) ?? calqueEditable(doc, l.calqueId) ?? pointsValides(l.a, l.b);
  if (refus) return { ok: false, erreur: refus };
  return { ok: true, contenu: { ...doc, primitives: [...doc.primitives, { id: l.id, type: "ligne", calqueId: l.calqueId, a: { ...l.a }, b: { ...l.b } }] } };
}

export function ajouterCote(doc: ContenuDocument2D, c: { id: string; calqueId: string; a: Point; b: Point; decalage: number; liens: { a: LienCote; b: LienCote } }): Resultat {
  const refus = idLibre(doc, c.id) ?? calqueEditable(doc, c.calqueId) ?? pointsValides(c.a, c.b) ?? (Number.isFinite(c.decalage) ? null : "Décalage invalide.");
  if (refus) return { ok: false, erreur: refus };
  for (const ext of ["a", "b"] as const) {
    const lien = c.liens[ext];
    if (!lien) continue;
    const cible = doc.primitives.find((p): p is Ligne => p.type === "ligne" && p.id === lien.primitiveId);
    if (!cible || !egal(cible[lien.extremite], c[ext])) return { ok: false, erreur: "Lien de cote incohérent." };
  }
  const cote: Cote = { id: c.id, type: "cote", calqueId: c.calqueId, a: { ...c.a }, b: { ...c.b }, decalage: c.decalage, liens: { a: c.liens.a, b: c.liens.b }, aResoudre: false };
  return { ok: true, contenu: { ...doc, primitives: [...doc.primitives, cote] } };
}

/** Modifie les extrémités d'une ligne ; les cotes liées suivent (même identité, valeur recalculée à l'affichage). */
export function modifierLigne(doc: ContenuDocument2D, id: string, points: { a: Point; b: Point }): Resultat {
  const ligne = doc.primitives.find((p): p is Ligne => p.type === "ligne" && p.id === id);
  if (!ligne) return { ok: false, erreur: "Ligne introuvable." };
  const refus = calqueEditable(doc, ligne.calqueId) ?? pointsValides(points.a, points.b);
  if (refus) return { ok: false, erreur: refus };
  const primitives = doc.primitives.map((p): Primitive => {
    if (p.id === id) return { ...ligne, a: { ...points.a }, b: { ...points.b } };
    if (p.type !== "cote") return p;
    const a = p.liens.a?.primitiveId === id ? { ...points[p.liens.a.extremite] } : p.a;
    const b = p.liens.b?.primitiveId === id ? { ...points[p.liens.b.extremite] } : p.b;
    return a === p.a && b === p.b ? p : { ...p, a, b };
  });
  const coteNulle = primitives.find((p) => p.type === "cote" && egal(p.a, p.b));
  if (coteNulle) return { ok: false, erreur: "Une cote liée deviendrait de longueur nulle." };
  return { ok: true, contenu: { ...doc, primitives } };
}

export function modifierDecalage(doc: ContenuDocument2D, id: string, decalage: number): Resultat {
  const cote = doc.primitives.find((p): p is Cote => p.type === "cote" && p.id === id);
  if (!cote) return { ok: false, erreur: "Cote introuvable." };
  const refus = calqueEditable(doc, cote.calqueId) ?? (Number.isFinite(decalage) ? null : "Décalage invalide.");
  if (refus) return { ok: false, erreur: refus };
  return { ok: true, contenu: { ...doc, primitives: doc.primitives.map((p) => (p.id === id ? { ...cote, decalage } : p)) } };
}

/** Supprime des primitives ; une cote dont la ligne disparaît reste, ses liens rompus et « à résoudre ». */
export function supprimer(doc: ContenuDocument2D, ids: readonly string[]): Resultat {
  const cibles = doc.primitives.filter((p) => ids.includes(p.id));
  if (cibles.length === 0) return { ok: false, erreur: "Rien à supprimer." };
  const verrou = cibles.map((p) => calqueEditable(doc, p.calqueId)).find(Boolean);
  if (verrou) return { ok: false, erreur: verrou };
  const primitives = doc.primitives
    .filter((p) => !ids.includes(p.id))
    .map((p): Primitive => {
      if (p.type !== "cote") return p;
      const rompreA = !!p.liens.a && ids.includes(p.liens.a.primitiveId);
      const rompreB = !!p.liens.b && ids.includes(p.liens.b.primitiveId);
      return rompreA || rompreB ? { ...p, liens: { a: rompreA ? null : p.liens.a, b: rompreB ? null : p.liens.b }, aResoudre: true } : p;
    });
  return { ok: true, contenu: { ...doc, primitives } };
}

export function ajouterCalque(doc: ContenuDocument2D, c: { id: string; nom: string }): Resultat {
  const nom = c.nom.trim();
  if (!ID.test(c.id) || doc.calques.some((x) => x.id === c.id)) return { ok: false, erreur: "Identifiant de calque invalide." };
  if (!nom || nom.length > LIMITES_DOCUMENT2D.nom) return { ok: false, erreur: "Nom de calque requis." };
  if (doc.calques.length >= LIMITES_DOCUMENT2D.calques) return { ok: false, erreur: "Trop de calques." };
  return { ok: true, contenu: { ...doc, calques: [...doc.calques, { id: c.id, nom, visible: true, verrouille: false }] } };
}

export function reglerCalque(doc: ContenuDocument2D, id: string, reglage: Partial<Pick<Calque, "visible" | "verrouille">>): Resultat {
  if (!doc.calques.some((c) => c.id === id)) return { ok: false, erreur: "Calque inconnu." };
  return { ok: true, contenu: { ...doc, calques: doc.calques.map((c) => (c.id === id ? { ...c, ...reglage } : c)) } };
}

// ——— Accrochage : extrémités puis milieux des lignes visibles, dans une tolérance exprimée en mètres ———

export type Accroche = { point: Point; type: "extremite"; primitiveId: string; extremite: Extremite } | { point: Point; type: "milieu"; primitiveId: string };

export function accrocher(doc: ContenuDocument2D, p: Point, tolerance: number): Accroche | null {
  const visibles = new Set(doc.calques.filter((c) => c.visible).map((c) => c.id));
  let meilleure: { a: Accroche; d: number; rang: number } | null = null;
  for (const l of doc.primitives) {
    if (l.type !== "ligne" || !visibles.has(l.calqueId)) continue;
    const candidats: [Accroche, number][] = [
      [{ point: l.a, type: "extremite", primitiveId: l.id, extremite: "a" }, 0],
      [{ point: l.b, type: "extremite", primitiveId: l.id, extremite: "b" }, 0],
      [{ point: milieu(l.a, l.b), type: "milieu", primitiveId: l.id }, 1],
    ];
    for (const [a, rang] of candidats) {
      const d = distance(p, a.point);
      // Priorité : l'extrémité l'emporte sur le milieu ; à rang égal, la plus proche.
      if (d <= tolerance && (!meilleure || rang < meilleure.rang || (rang === meilleure.rang && d < meilleure.d))) meilleure = { a, d, rang };
    }
  }
  return meilleure?.a ?? null;
}

/** Distance d'un point à un segment (sélection). */
export function distanceSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return distance(p, { x: a.x + t * dx, y: a.y + t * dy });
}

/** Emprise des primitives (pour cadrer), ou null pour un document vide. */
export function emprise(doc: ContenuDocument2D): { min: Point; max: Point } | null {
  if (doc.primitives.length === 0) return null;
  const xs = doc.primitives.flatMap((p) => [p.a.x, p.b.x]);
  const ys = doc.primitives.flatMap((p) => [p.a.y, p.b.y]);
  return { min: { x: Math.min(...xs), y: Math.min(...ys) }, max: { x: Math.max(...xs), y: Math.max(...ys) } };
}

// ——— Historique local (annuler / rétablir avant et après enregistrement) ———

export interface Historique {
  passe: ContenuDocument2D[];
  present: ContenuDocument2D;
  futur: ContenuDocument2D[];
}
export const historique = (present: ContenuDocument2D): Historique => ({ passe: [], present, futur: [] });
export const appliquer = (h: Historique, contenu: ContenuDocument2D): Historique => ({ passe: [...h.passe, h.present].slice(-200), present: contenu, futur: [] });
export const annuler = (h: Historique): Historique => (h.passe.length ? { passe: h.passe.slice(0, -1), present: h.passe[h.passe.length - 1]!, futur: [h.present, ...h.futur] } : h);
export const retablir = (h: Historique): Historique => (h.futur.length ? { passe: [...h.passe, h.present], present: h.futur[0]!, futur: h.futur.slice(1) } : h);
